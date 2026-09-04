import { expect, type Locator, type Page } from '@playwright/test';

/** A bounding box enriched with the derived edges the layout assertions need. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centreX: number;
  centreY: number;
}

export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  /**
   * Measure an element for the position/layout assertions.
   *
   * boundingBox() returns null for a detached or zero-size element, which would
   * otherwise surface as an unreadable "cannot read property x of null". We
   * assert visibility first so a layout failure names the element that moved.
   */
  async boxOf(target: Locator, name: string): Promise<Box> {
    await expect(target, `"${name}" must be visible before it can be measured`).toBeVisible();
    const box = await target.boundingBox();
    if (box === null) {
      throw new Error(`"${name}" is attached to the DOM but has no layout box (display:none or zero size).`);
    }
    return {
      ...box,
      right: box.x + box.width,
      bottom: box.y + box.height,
      centreX: box.x + box.width / 2,
      centreY: box.y + box.height / 2,
    };
  }

  /**
   * Whether an element becomes visible within `timeout`.
   *
   * Deliberately NOT `locator.isVisible()`: that method answers immediately
   * about the current DOM and does not wait, even when passed a timeout — so on
   * a page that streams its content in, it reports false for an element that is
   * merely late. `waitFor` polls properly. Returns a boolean rather than
   * throwing, for the genuinely optional elements (a filter that some layout
   * variants do not offer).
   */
  async isEventuallyVisible(target: Locator, timeout = 20_000): Promise<boolean> {
    return target
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /** The viewport the assertions are relative to. */
  viewport(): { width: number; height: number } {
    const size = this.page.viewportSize();
    if (size === null) {
      throw new Error('This browser context has no viewport size, so layout cannot be asserted.');
    }
    return size;
  }

  /**
   * Consent banners and promo overlays appear intermittently on this site and can
   * sit on top of the header. Best-effort only: never fail a test because an
   * overlay we wanted to close was not there, or closed itself first.
   */
  async dismissOverlays(): Promise<void> {
    const candidates: Locator[] = [
      this.page.getByRole('button', { name: /^(accept|agree|got it|ok)\b/i }),
      this.page.getByRole('button', { name: 'Close', exact: true }),
    ];

    for (const candidate of candidates) {
      const overlay = candidate.first();
      const present = await overlay.isVisible({ timeout: 2_000 }).catch(() => false);
      if (present) {
        await overlay.click({ timeout: 3_000 }).catch(() => undefined);
      }
    }
  }
}
