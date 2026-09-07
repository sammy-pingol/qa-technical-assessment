import { test, expect } from './fixtures/pages.fixture';

/**
 * Case study 1c — "develop assertions for flight search results".
 *
 * These tests deep-link to a dated search rather than re-driving the home page
 * calendar. That is a deliberate call, not a shortcut: the calendar is a
 * lazily-rendered drawer with no stable day-cell hooks (docs/site-recon.md,
 * finding 4), and re-testing the same form navigation in every results test
 * would add fragility without adding coverage. The form-driven path is covered
 * end-to-end in flight-search.spec.ts. See docs/test-plan.md §5.
 */
test.describe('Flight search results', () => {
  const ORIGIN = 'SYD';
  const DESTINATION = 'MEL';
  /**
   * Melbourne is served by more than one airport: a search for MEL legitimately
   * returns flights into Avalon (AVV) too, and the site's own airport filter
   * offers both. Asserting every card contains literally "MEL" would fail on a
   * perfectly valid result — the correct assertion is that each card names an
   * airport that serves the destination city.
   */
  const DESTINATION_AIRPORTS = ['MEL', 'AVV'];

  test.beforeEach(async ({ results }) => {
    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37));
    await results.waitForResults();
  });

  test('TC-W-040 (P) the search returns at least one flight result', async ({ results }) => {
    const count = await results.cardCount();
    expect(count, 'a mainstream domestic route should return flight results').toBeGreaterThan(0);
  });

  test('TC-W-041 (P) the results counter reports a coherent shown/total pair', async ({ results }) => {
    /**
     * The counter renders only once the result stream settles, and one of the
     * layout variants this site A/B tests omits it entirely — results and
     * filters render, the "N of M flights" summary simply is not there. Skipping
     * on that variant is honest; asserting a counter that the product does not
     * always ship would be a false failure. Recorded in docs/test-plan.md §6.
     */
    const hasCounter = await results.isEventuallyVisible(results.resultsCount, 45_000);
    test.skip(!hasCounter, 'This layout variant does not render a results counter.');

    const counts = await results.parseResultsCount();

    expect(counts, 'the results counter should render in the form "N of M flights"').not.toBeNull();
    expect(counts!.shown, 'at least one flight should be shown').toBeGreaterThan(0);
    expect(counts!.total, 'the total should be at least the number shown').toBeGreaterThanOrEqual(counts!.shown);
  });

  test('TC-W-042 (P) every result carries a valid, positive price', async ({ results }) => {
    const prices = await results.allPrices(10);

    expect(prices.length, 'prices should be rendered for the visible results').toBeGreaterThan(0);
    for (const price of prices) {
      expect.soft(price, `price ${price} should be a positive amount`).toBeGreaterThan(0);
      expect.soft(price, `price ${price} is implausibly high for a domestic return fare`).toBeLessThan(100_000);
    }
  });

  test('TC-W-043 (P) every result states its route, duration, stops and departure times', async ({ results }) => {
    const flights = await results.readResults(5);
    expect(flights.length, 'results should be parseable').toBeGreaterThan(0);

    for (const [index, flight] of flights.entries()) {
      expect.soft(flight.airportCodes, `result ${index + 1} should name the origin airport`).toContain(ORIGIN);
      expect
        .soft(
          flight.airportCodes.some((code) => DESTINATION_AIRPORTS.includes(code)),
          `result ${index + 1} should name an airport serving the destination city `
          + `(one of ${DESTINATION_AIRPORTS.join(', ')}), got ${flight.airportCodes.join(', ')}`,
        )
        .toBe(true);
      expect.soft(flight.durations.length, `result ${index + 1} should state a flight duration like "1h 40m"`).toBeGreaterThan(0);
      expect.soft(flight.stops.length, `result ${index + 1} should state its stop count`).toBeGreaterThan(0);
      expect.soft(flight.times.length, `result ${index + 1} should state departure and arrival times`).toBeGreaterThanOrEqual(2);
    }
  });

  test('TC-W-044 (P) the results page echoes the dates that were searched', async ({ results }) => {
    await expect(results.departureSummary).toBeVisible();
    await expect(results.returnSummary).toBeVisible();

    const departure = await results.departureSummary.getAttribute('aria-label');
    const inbound = await results.returnSummary.getAttribute('aria-label');

    expect(departure, 'the departure control should echo a concrete date').toMatch(/Departure date\s+\S+/);
    expect(inbound, 'the return control should echo a concrete date').toMatch(/Return date\s+\S+/);
  });

  test('TC-W-045 (P) result cards are laid out vertically, in order, inside the results list', async ({ results }) => {
    const list = await results.boxOf(results.list, 'results list');
    const first = await results.boxOf(results.cards.nth(0), 'first result card');
    const second = await results.boxOf(results.cards.nth(1), 'second result card');

    // Position assertion on the results list: cards stack downward and stay
    // horizontally contained by their list, rather than escaping the column.
    expect.soft(second.y, 'the second result should render below the first').toBeGreaterThan(first.y);
    expect.soft(first.x, 'result cards should be horizontally contained by the results list').toBeGreaterThanOrEqual(list.x - 1);
    expect.soft(first.right, 'result cards should not overflow the results list').toBeLessThanOrEqual(list.right + 1);
  });

  test('TC-W-046 (P) filtering to direct flights only returns direct flights', async ({ results, page }) => {
    // Null-tolerant: the counter is late often enough that failing on it here
    // would test the counter, not the filter. TC-W-041 owns the counter.
    const before = await results.parseResultsCount();

    const filterVisible = await results.isEventuallyVisible(results.directOnlyFilter, 20_000);
    test.skip(!filterVisible, 'The Direct filter is not offered for this route/layout variant.');

    await results.directOnlyFilter.click();
    await page.waitForTimeout(4_000); // the list re-queries on filter change
    await results.waitForResults();

    const flights = await results.readResults(5);
    for (const [index, flight] of flights.entries()) {
      expect.soft(
        flight.stops.join(' ').toLowerCase(),
        `result ${index + 1} should be direct once the Direct filter is applied`,
      ).toContain('direct');
    }

    const after = await results.parseResultsCount();
    if (before !== null && after !== null) {
      expect.soft(after.shown, 'filtering should not increase the number of results').toBeLessThanOrEqual(before.shown);
    }
  });

  test('TC-W-047 (N) a nonsensical route does not fabricate results', async ({ results, page }) => {
    await results.openSearch('XXX', 'YYY', futureDate(30), futureDate(37));

    // An invalid IATA pair must not render a populated results list.
    const populated = await results.cards.first().isVisible({ timeout: 20_000 }).catch(() => false);
    expect(populated, 'an invalid airport pair should not return flight results').toBe(false);
    await expect(page.locator('body')).not.toContainText(/(unexpected error|something went wrong)/i);
  });

  test('TC-W-048 (N) a departure date in the past is not accepted as a valid search', async ({ results, page }) => {
    await results.openSearch(ORIGIN, DESTINATION, pastDate(30), pastDate(23));

    const populated = await results.cards.first().isVisible({ timeout: 20_000 }).catch(() => false);
    expect(populated, 'flights cannot be sold for dates that have already passed').toBe(false);
    await expect(page.locator('body')).not.toContainText(/unexpected error/i);
  });
});

/**
 * Sorting — part of case study 1c, "develop assertions for flight search
 * results". Ordering is a property of the result set as a whole rather than of
 * any one card, so it gets its own group.
 *
 * The assertion is on the ORDER, not on specific prices or durations: live
 * inventory changes hourly, so "the third result costs $322" would be worthless
 * within the hour, while "each result costs at least as much as the one above
 * it" is true for as long as the feature works.
 */
test.describe('Flight search results — sorting', () => {
  const ORIGIN = 'SYD';
  const DESTINATION = 'MEL';

  test('TC-W-049 (P) sorting by cheapest returns prices in ascending order', async ({ results }) => {
    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37), 'price_a');
    await results.waitForResults();

    const prices = (await results.readResults(8)).map((flight) => flight.price);
    const known = prices.filter((price): price is number => price !== null);

    expect(known.length, 'prices should be parseable from the sorted results').toBeGreaterThan(1);
    for (let index = 1; index < known.length; index += 1) {
      expect.soft(
        known[index],
        `result ${index + 1} ($${known[index]}) should cost at least as much as result ${index} ($${known[index - 1]}) when sorted by cheapest`,
      ).toBeGreaterThanOrEqual(known[index - 1]);
    }
  });

  test('TC-W-050 (P) sorting by quickest returns durations in ascending order', async ({ results }) => {
    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37), 'duration_a');
    await results.waitForResults();

    const durations = (await results.readResults(8))
      .map((flight) => flight.totalDurationMinutes)
      .filter((minutes) => minutes > 0);

    expect(durations.length, 'durations should be parseable from the sorted results').toBeGreaterThan(1);
    for (let index = 1; index < durations.length; index += 1) {
      expect.soft(
        durations[index],
        `result ${index + 1} (${durations[index]}min) should take at least as long as result ${index} (${durations[index - 1]}min) when sorted by quickest`,
      ).toBeGreaterThanOrEqual(durations[index - 1]);
    }
  });

  test('TC-W-051 (P) the cheapest sort surfaces a fare no higher than the default sort', async ({ results }) => {
    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37), 'bestflight_a');
    await results.waitForResults();
    const defaultTop = (await results.readResults(1))[0]?.price;

    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37), 'price_a');
    await results.waitForResults();
    const cheapestTop = (await results.readResults(1))[0]?.price;

    expect(defaultTop, 'the default sort should surface a priced result').not.toBeNull();
    expect(cheapestTop, 'the cheapest sort should surface a priced result').not.toBeNull();

    // The whole point of a "cheapest" sort: its top result cannot cost more.
    expect(
      cheapestTop!,
      `sorting by cheapest ($${cheapestTop}) must not surface a dearer top fare than the default sort ($${defaultTop})`,
    ).toBeLessThanOrEqual(defaultTop!);
  });

  test('TC-W-052 (N) an unrecognised sort value does not break the results page', async ({ results, page }) => {
    await results.openSearch(ORIGIN, DESTINATION, futureDate(30), futureDate(37), 'not_a_real_sort');

    // Degrade gracefully: fall back to some ordering, never error.
    await results.waitForResults();
    await expect(page.locator('body')).not.toContainText(/(unexpected error|something went wrong|500 internal)/i);
  });
});

function shiftDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
const futureDate = (days: number): string => shiftDate(days);
const pastDate = (days: number): string => shiftDate(-days);
