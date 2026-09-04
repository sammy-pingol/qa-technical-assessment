import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page';

/** One parsed flight result card. */
export interface FlightResult {
  raw: string;
  price: number | null;
  durations: string[];
  stops: string[];
  times: string[];
  airportCodes: string[];
}

/**
 * Flight search results page.
 *
 * Selector strategy — three tiers, in order of preference:
 *   1. real, stable ids            #flight-results-list-wrapper
 *   2. stable id PREFIXES          [id^="result-card-description-"]
 *   3. semantic class SUFFIXES     [class*="-results-count"], [class*="-price-text"]
 *
 * Tier 3 needs explaining: this site's classes look like `e2GB-price-text`, where
 * `e2GB` is a rotating build hash and `-price-text` is the stable, human-authored
 * part. Matching the suffix survives a redeploy; matching the whole class does not.
 */
/** "1h 40m" / "2h" — the marker that distinguishes a flight card from an ad. */
const DURATION = /\d+h\s?\d*m/;

/**
 * IATA codes render glued to the airport name — "SYDKingsford Smith" — so a
 * trailing \b never matches. Assert the three capitals are not followed by a
 * lowercase letter instead.
 */
const AIRPORT_CODE = /\b[A-Z]{3}(?![a-z])/g;

/** Keyboard skip-links Playwright picks up in innerText but a user never sees. */
const SKIP_LINKS = /Go to (next|previous) result|Go to price section|Go to result details/g;

export class ResultsPage extends BasePage {
  readonly list: Locator;
  readonly cards: Locator;
  readonly prices: Locator;
  readonly resultsCount: Locator;
  readonly originSummary: Locator;
  readonly destinationSummary: Locator;
  readonly departureSummary: Locator;
  readonly returnSummary: Locator;
  readonly directOnlyFilter: Locator;

  constructor(page: Page) {
    super(page);

    this.list = page.locator('#flight-results-list-wrapper');
    /**
     * A flight card is identified by what makes it a flight card: it states a
     * duration like "1h 40m". Two locators that looked right were not:
     *   [id^="result-card-description-"]  -> resolves to sponsored placements
     *   [class*="nrc6-wrapper"]           -> nrc6 is a rotating build hash
     * Filtering the result containers on their own content is hash-free and
     * excludes ad units without having to enumerate them.
     */
    this.cards = page
      .locator('#flight-results-list-wrapper [class*="-result-item-container"]')
      .filter({ hasText: DURATION });
    this.prices = page.locator('[class*="-price-text"]');
    /**
     * Located by its CONTENT, not its class. The class-suffix form
     * ([class*="-results-count"]) works in the layout variant it was captured
     * in and does not exist at all in another the site A/B tests — a text match
     * finds the counter wherever it is rendered, and in whichever wrapper.
     */
    this.resultsCount = page.getByText(/[\d,]+\s+of\s+[\d,]+\s+flights/i).first();

    // On the results page these controls echo the SUBMITTED values in their
    // accessible name, e.g. aria-label="Flight origin input Sydney". That makes
    // them a first-class assertion target for "what I asked for is what I got".
    this.originSummary = page.locator('[aria-label^="Flight origin input "]').first();
    this.destinationSummary = page.locator('[aria-label^="Flight destination input "]').first();
    this.departureSummary = page.locator('[aria-label^="Departure date "]').first();
    this.returnSummary = page.locator('[aria-label^="Return date "]').first();

    // Widened across layout variants: the accessible name differs between the
    // desktop sidebar and the responsive filter panel.
    this.directOnlyFilter = page
      .locator('[aria-label="Only show results for Direct"]')
      .or(page.getByRole('checkbox', { name: /\bDirect\b/i }))
      .or(page.getByRole('button', { name: /^Direct$/i }))
      .first();
  }

  /** Navigate straight to a dated search. Used where driving the calendar drawer would add fragility without adding coverage — see docs/test-plan.md §5. */
  async openSearch(origin: string, destination: string, departISO: string, returnISO: string): Promise<void> {
    await this.page.goto(`/flight-search/${origin}-${destination}/${departISO}/${returnISO}?sort=bestflight_a`, {
      waitUntil: 'domcontentloaded',
    });
    await this.dismissOverlays();
  }

  /** Results stream in progressively; wait for the list to actually populate. */
  async waitForResults(timeout = 60_000): Promise<void> {
    await expect(this.list, 'the results list container should render').toBeVisible({ timeout });
    await expect(this.cards.first(), 'at least one flight result should be returned').toBeVisible({ timeout });
  }

  /**
   * e.g. "3777 of 3798 flights" -> { shown: 3777, total: 3798 }
   *
   * Returns null rather than throwing when the counter has not rendered: it
   * appears only once the result stream settles, and a caller comparing counts
   * before and after a filter should degrade gracefully rather than fail on a
   * element that is merely late.
   */
  async parseResultsCount(): Promise<{ shown: number; total: number } | null> {
    if (!(await this.isEventuallyVisible(this.resultsCount, 30_000))) {
      return null;
    }
    const text = (await this.resultsCount.textContent())?.trim() ?? '';
    const match = text.match(/([\d,]+)\s+of\s+([\d,]+)\s+flights/i);
    if (match === null) {
      return null;
    }
    const toInt = (value: string): number => Number.parseInt(value.replace(/,/g, ''), 10);
    return { shown: toInt(match[1]), total: toInt(match[2]) };
  }

  async cardCount(): Promise<number> {
    return this.cards.count();
  }

  /** Parse the first `limit` cards into structured data the specs can assert on. */
  async readResults(limit = 5): Promise<FlightResult[]> {
    const available = Math.min(limit, await this.cards.count());
    const results: FlightResult[] = [];

    for (let index = 0; index < available; index += 1) {
      const raw = ((await this.cards.nth(index).innerText()) ?? '')
        .replace(SKIP_LINKS, '')
        .replace(/\s+/g, ' ')
        .trim();
      results.push({
        raw,
        price: this.extractPrice(raw),
        durations: raw.match(DURATION) ?? [],
        stops: raw.match(/direct|\d+\s+stops?/gi) ?? [],
        times: raw.match(/\b\d{1,2}:\d{2}\b/g) ?? [],
        airportCodes: [...new Set(raw.match(AIRPORT_CODE) ?? [])],
      });
    }
    return results;
  }

  private extractPrice(text: string): number | null {
    const match = text.match(/\$([\d,]+)/);
    return match === null ? null : Number.parseInt(match[1].replace(/,/g, ''), 10);
  }

  /** Every price currently rendered in the list, as numbers. */
  async allPrices(limit = 10): Promise<number[]> {
    const available = Math.min(limit, await this.prices.count());
    const values: number[] = [];
    for (let index = 0; index < available; index += 1) {
      const parsed = this.extractPrice((await this.prices.nth(index).innerText()) ?? '');
      if (parsed !== null) {
        values.push(parsed);
      }
    }
    return values;
  }
}
