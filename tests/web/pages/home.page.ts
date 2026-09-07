import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page';

/** An airport to type into the search form, plus what its suggestion should say. */
export interface LocationQuery {
  /** Text typed into the field, e.g. "Sydney". */
  term: string;
  /** Pattern the chosen autocomplete option must match, e.g. /Sydney/. */
  option: RegExp;
}

/**
 * Each airport input owns its own autocomplete listbox, named by the input's
 * `aria-controls`. Scoping to these ids is essential: the page keeps roughly 16
 * other `role="option"` elements alive at all times (country picker, trip type,
 * cabin class), so an unscoped `getByRole('option')` silently matches a
 * completely different widget.
 */
/**
 * A UTC-normalised date `days` from today. UTC throughout so the label we build
 * can never drift a day against the browser's pinned Australia/Sydney timezone.
 */
export function daysFromToday(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
}

/** The prefix of a calendar day button's accessible name, e.g. "October 1 2026". */
export function calendarDayLabel(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

const ORIGIN_LISTBOX = 'flight-origin-smarty-input-list';
const DESTINATION_LISTBOX = 'flight-destination-smarty-input-list';

/**
 * cheapflights.com.au home page.
 *
 * Every locator is anchored on the accessibility layer (role + accessible name).
 * The site ships no data-testid attributes and its CSS classes are build hashes
 * (mc6t, gPDR, nrc6 ...) that rotate on deploy — see docs/site-recon.md.
 */
export class HomePage extends BasePage {
  readonly header: Locator;
  readonly logo: Locator;
  readonly signIn: Locator;
  readonly navigationToggle: Locator;

  readonly searchForm: Locator;
  readonly originField: Locator;
  readonly originInput: Locator;
  readonly destinationField: Locator;
  readonly destinationInput: Locator;
  readonly swapButton: Locator;
  readonly departureDate: Locator;
  readonly returnDate: Locator;
  readonly searchButton: Locator;
  readonly nextMonth: Locator;

  constructor(page: Page) {
    super(page);

    this.header = page.locator('header').first();
    this.logo = page.getByRole('link', { name: 'Go to the cheapflights homepage' }).first();
    this.signIn = page.getByRole('button', { name: 'Sign in' }).first();
    this.navigationToggle = page.getByRole('button', { name: 'Open main navigation' }).first();

    this.searchForm = page.locator('#main-search-form');
    // Container elements carry the chip + the input; the input carries the label.
    this.originField = page.locator('[aria-label^="Flight origin input"]').first();
    this.destinationField = page.locator('[aria-label^="Flight destination input"]').first();
    /**
     * These two inputs are the only elements on the site that expose a test
     * hook (`data-test-origin` / `data-test-destination`), so we use it — an
     * explicit hook always beats an inferred one. The role+name locator is
     * kept as a documented fallback via .or().
     *
     * Note the `exact: true`: Playwright matches an accessible name by
     * SUBSTRING by default, and "Destination location" is a substring of the
     * swap control's "Swap origin and destination locations". Without it the
     * locator resolves to two elements and fails strict mode.
     */
    this.originInput = page
      .locator('input[data-test-origin]')
      .or(page.getByRole('combobox', { name: 'Origin location', exact: true }))
      .first();
    this.destinationInput = page
      .locator('input[data-test-destination]')
      .or(page.getByRole('combobox', { name: 'Destination location', exact: true }))
      .first();

    this.swapButton = page.getByRole('button', { name: /^Swap (origin and destination locations|departure airport and destination airport)$/ });
    this.departureDate = page.getByRole('button', { name: /^Departure date/ });
    this.returnDate = page.getByRole('button', { name: /^Return date/ });
    this.searchButton = page.getByRole('button', { name: 'Search', exact: true });
    this.nextMonth = page.getByRole('button', { name: 'Next month' }).first();
  }

  async open(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(this.searchForm, 'the flight search form should render on the home page').toBeVisible();
    await this.dismissOverlays();
  }

  /**
   * Selected airports render as removable chips rather than as an input value,
   * so clearing means dismissing chips, not clearing text. The site also
   * remembers the previous search and geolocates a default origin, which is why
   * every search explicitly clears before it types.
   */
  private async clearField(container: Locator): Promise<void> {
    const remove = container.getByRole('button', { name: /^Remove( value)?$/ });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const present = await remove.first().isVisible({ timeout: 1_500 }).catch(() => false);
      if (!present) {
        return;
      }
      await remove.first().click({ timeout: 3_000 }).catch(() => undefined);
    }
  }

  /** The open suggestion list belonging to one specific airport input. */
  private options(listboxId: string): Locator {
    return this.page.locator(`#${listboxId} [role="option"]`);
  }

  private async chooseLocation(
    container: Locator,
    input: Locator,
    listboxId: string,
    query: LocationQuery,
  ): Promise<void> {
    await this.clearField(container);

    /**
     * Keep the document at the top before opening the suggestion list.
     *
     * This site's header becomes sticky once the page is scrolled, and it then
     * overlaps the top of the autocomplete list. Playwright correctly refuses to
     * click an element that another element would receive the pointer event for,
     * so the click times out with the option sitting right there, visible and
     * enabled. It reproduced on CI and not locally purely because ad content
     * shifted the form far enough down the page to trigger the sticky state.
     */
    await this.page.evaluate(() => window.scrollTo(0, 0));

    await input.click();
    await input.fill(query.term);

    const suggestion = this.options(listboxId).filter({ hasText: query.option }).first();
    await expect(suggestion, `an autocomplete suggestion matching ${query.option} should appear for "${query.term}"`)
      .toBeVisible({ timeout: 20_000 });

    try {
      await suggestion.click({ timeout: 10_000 });
    } catch {
      /**
       * Fallback for the same overlap: a keypress cannot be intercepted by an
       * overlaying element. This is not a blind Enter — the assertion below
       * proves the field ended up holding the airport we asked for, so a wrong
       * selection still fails the test. It is also the path a keyboard or
       * screen-reader user takes, which is worth exercising.
       */
      await input.press('ArrowDown');
      await input.press('Enter');
    }

    /**
     * Committing the suggestion is the step that actually populates the field,
     * and the form silently refuses to submit if it did not take. Assert it here
     * so a failure names the real cause instead of surfacing later as a
     * mysterious "the search never navigated".
     */
    await expect(container, `the field should hold a value matching ${query.option} after selection`)
      .toContainText(query.option, { timeout: 10_000 });
  }

  async setOrigin(query: LocationQuery): Promise<void> {
    await this.chooseLocation(this.originField, this.originInput, ORIGIN_LISTBOX, query);
  }

  async setDestination(query: LocationQuery): Promise<void> {
    await this.chooseLocation(this.destinationField, this.destinationInput, DESTINATION_LISTBOX, query);
  }

  /** Type into a field without committing a suggestion — used by negative tests. */
  async typeDestinationWithoutSelecting(term: string): Promise<void> {
    await this.clearField(this.destinationField);
    await this.destinationInput.click();
    await this.destinationInput.fill(term);
  }

  /** How many autocomplete suggestions the destination field is currently offering. */
  async suggestionCount(): Promise<number> {
    await this.page.waitForTimeout(2_000); // let the debounced lookup settle
    return this.options(DESTINATION_LISTBOX).count();
  }

  /** The text currently shown in a field, e.g. "Sydney (SYD)". */
  async fieldText(container: Locator): Promise<string> {
    return ((await container.innerText()) ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Pick one day out of the calendar.
   *
   * The picker renders two months at a time, so page forward until the target
   * month is on screen. The loop is bounded: a date the calendar will never
   * offer fails with a readable message instead of spinning.
   */
  private async pickDay(date: Date): Promise<void> {
    const label = calendarDayLabel(date);
    const day = this.page.locator(`[role="button"][aria-label^="${label}"]`).first();

    for (let advance = 0; advance < 6; advance += 1) {
      if (await day.isVisible({ timeout: 2_000 }).catch(() => false)) {
        break;
      }
      await this.nextMonth.click();
      await this.page.waitForTimeout(400);
    }

    await expect(day, `the calendar should offer ${label}`).toBeVisible({ timeout: 10_000 });
    await day.click();
  }

  /**
   * Set the departure and return dates.
   *
   * This is NOT optional: in a fresh browser context both date fields are empty
   * and the form refuses to submit with "Please enter a valid 'Depart' date".
   * An earlier version of this suite skipped it and every negative search test
   * passed for the wrong reason — the search was rejected for missing dates
   * rather than for the condition under test.
   */
  async setTripDates(departure: Date, returning: Date): Promise<void> {
    await this.departureDate.click();
    await this.pickDay(departure);
    await this.pickDay(returning);

    await expect(this.departureDate, 'the departure field should show a date once picked')
      .toContainText(/\d/, { timeout: 10_000 });
  }

  async submit(): Promise<void> {
    await this.searchButton.click();
  }

  /** Submit and wait for the results route. Returns false if we never left the form. */
  async submitAndAwaitResults(timeout = 60_000): Promise<boolean> {
    await this.submit();
    try {
      await this.page.waitForURL(/\/flight-search\//, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  async searchFlights(
    from: LocationQuery,
    to: LocationQuery,
    departure: Date = daysFromToday(30),
    returning: Date = daysFromToday(37),
  ): Promise<boolean> {
    await this.setOrigin(from);
    await this.setDestination(to);
    await this.setTripDates(departure, returning);
    return this.submitAndAwaitResults();
  }
}
