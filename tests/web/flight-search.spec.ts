import { test, expect } from './fixtures/pages.fixture';
import { daysFromToday } from './pages/home.page';
import { ResultsPage } from './pages/results.page';

/**
 * Case study 1b — "develop tests for searching flights".
 *
 * Positive cases drive the real search form: clear the fields (the site
 * geolocates a default origin and remembers the previous search), type, commit
 * an autocomplete suggestion, submit, and confirm we land on a results route
 * that reflects what was asked for.
 *
 * Negative cases assert the inverse property — that an invalid or incomplete
 * search does NOT silently produce a results page. That framing matters: it
 * holds whether the site blocks the submit, shows an inline error, or keeps the
 * button disabled, so the test survives a UX change while still catching the
 * regression that matters.
 */
test.describe('Flight search', () => {
  const SYDNEY = { term: 'Sydney', option: /Sydney/i };
  const MELBOURNE = { term: 'Melbourne', option: /Melbourne/i };

  test.beforeEach(async ({ home }) => {
    await home.open();
  });

  test('TC-W-020 (P) the search form exposes all required trip inputs', async ({ home }) => {
    await expect(home.searchForm).toBeVisible();
    await expect(home.originInput).toBeVisible();
    await expect(home.destinationInput).toBeVisible();
    await expect(home.departureDate).toBeVisible();
    await expect(home.returnDate).toBeVisible();
    await expect(home.searchButton).toBeVisible();
    await expect(home.searchButton).toBeEnabled();
  });

  /**
   * TC-W-021, TC-W-022 and TC-W-023 assert three properties of ONE completed
   * search, so they share one journey.
   *
   * They began as three separate tests, each re-driving the whole four-field
   * form against the live site. That tripled the load for no extra coverage and
   * was the single largest source of flakiness in this suite — the searches
   * competed with each other across parallel workers and intermittently timed
   * out waiting for results. Grouping them cut three live searches to one.
   *
   * Soft assertions keep the diagnostic value the split gave us: if the title is
   * wrong but the route echoes correctly, the report says exactly that instead
   * of stopping at the first failure.
   */
  test('TC-W-021/022/023 (P) a Sydney to Melbourne search reaches results that echo the route', async ({ home }) => {
    const resultsTab = await home.searchFlights(SYDNEY, MELBOURNE);
    expect(resultsTab, 'TC-W-021: submitting a valid search should reach the flight results route').not.toBeNull();

    /**
     * The results may have opened in a NEW tab, with the tab we submitted from
     * handed off to a partner site (see HomePage.submitAndAwaitResults). Every
     * assertion below is therefore made against the tab that actually holds the
     * results, never against the tab we started in.
     */
    const onResults = new ResultsPage(resultsTab!);

    await expect(resultsTab!, 'TC-W-021: the results URL should carry the searched route').toHaveURL(/\/flight-search\/SYD-MEL\//);
    await onResults.waitForResults();

    // On the results page these controls carry the submitted value in their
    // accessible name, e.g. aria-label="Flight origin input Sydney".
    await expect.soft(onResults.originSummary, 'TC-W-022: the results page should echo the origin').toHaveAttribute('aria-label', /Sydney/i);
    await expect.soft(onResults.destinationSummary, 'TC-W-022: the results page should echo the destination').toHaveAttribute('aria-label', /Melbourne/i);
    await expect.soft(resultsTab!, 'TC-W-023: the page title should reflect the searched route').toHaveTitle(/SYD\s*to\s*MEL/i);
  });

  test('TC-W-024 (P) the swap control reverses origin and destination', async ({ home }) => {
    await home.setOrigin(SYDNEY);
    await home.setDestination(MELBOURNE);

    await expect(home.swapButton).toBeVisible();
    await home.swapButton.click();

    // On the home page the container's aria-label is static ("Flight origin
    // input"); the selected airport lives in its text, e.g. "Sydney (SYD)".
    // Only the results page echoes the value into the accessible name.
    await expect(home.originField).toContainText(/Melbourne/i);
    await expect(home.destinationField).toContainText(/Sydney/i);
  });

  test('TC-W-025 (N) an unrecognised destination offers no bookable suggestion', async ({ home }) => {
    await home.typeDestinationWithoutSelecting('Zzzzqqqx Not An Airport');

    const suggestions = await home.suggestionCount();
    expect(suggestions, 'nonsense input should not produce a selectable airport suggestion').toBe(0);
  });

  test('TC-W-026 (N) a search with no destination does not produce results', async ({ home }) => {
    await home.setOrigin(SYDNEY);
    // Dates ARE set, so the destination is the only thing missing. Without this
    // the form would be rejected for an empty date and the test would pass for
    // the wrong reason — see docs/test-plan.md §5.
    await home.setTripDates(daysFromToday(30), daysFromToday(37));
    // Destination deliberately left empty.
    const resultsTab = await home.submitAndAwaitResults(15_000);

    /**
     * Checked across EVERY open tab, not just the one we submitted from.
     *
     * The earlier version asserted only that THIS tab's URL was not a results
     * URL. Once the site began opening results in a new tab, a successful
     * search satisfied that too — so this test could no longer fail, and would
     * have stayed green through a genuine regression in destination validation.
     */
    expect(resultsTab, 'an incomplete search must not reach a results page in any tab').toBeNull();

    /**
     * A POSITIVE assertion that is capable of failing. Proving "no results" by
     * the absence of a URL is fragile: too many unrelated things also produce
     * that absence. Staying on the search form is the observable the test
     * actually cares about.
     */
    await expect(home.searchForm, 'an incomplete search should leave the user on the search form').toBeVisible();
  });

  test('TC-W-027 (N) an identical origin and destination does not produce results', async ({ home }) => {
    await home.setOrigin(SYDNEY);
    await home.setDestination(SYDNEY);
    // Valid dates, so an identical origin and destination is the only defect.
    await home.setTripDates(daysFromToday(30), daysFromToday(37));

    const resultsTab = await home.submitAndAwaitResults(15_000);

    // Across every open tab — see TC-W-026 for why the single-tab check was blind.
    expect(resultsTab, 'a Sydney to Sydney search is not a valid trip and must not return flights').toBeNull();
    await expect(home.searchForm, 'an invalid trip should leave the user on the search form').toBeVisible();
  });

  test('TC-W-028 (N) a route with no service still degrades gracefully rather than erroring', async ({ results, page }) => {
    // Two small regional airports with no direct commercial pairing.
    await results.openSearch('BHS', 'LSY', futureDate(30), futureDate(37));

    // Either results or an explicit empty state is acceptable; a crash is not.
    await expect(page.locator('body')).not.toContainText(/(unexpected error|something went wrong|500 internal)/i);
  });
});

/** ISO date `daysFromNow` days in the future — keeps the suite from expiring. */
function futureDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}
