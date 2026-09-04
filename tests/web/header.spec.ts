import { test, expect } from './fixtures/pages.fixture';

/**
 * Case study 1a — "validation the logo and login button is displayed"
 * plus the MUST HAVE "location/position of web element assertions".
 *
 * Two kinds of check live here and they are deliberately separate:
 *
 *   PRESENCE — is it in the DOM and visible?
 *   POSITION — is it in the RIGHT PLACE relative to the header, the viewport
 *              and each other?
 *
 * Presence alone passes on a page where the logo has been pushed 4000px down or
 * is sitting underneath a modal. The position assertions are written as layout
 * INVARIANTS ("the logo is in the left half", "the two are on a shared
 * horizontal axis") rather than as hard-coded pixel coordinates, so a routine
 * redesign does not fail them but a genuine layout regression does.
 * Baseline geometry captured during recon is in docs/site-recon.md.
 */
test.describe('Header — branding and account entry point', () => {
  test.beforeEach(async ({ home }) => {
    await home.open();
  });

  test('TC-W-001 (P) the Cheapflights logo is displayed and links to the home page', async ({ home }) => {
    await expect(home.logo).toBeVisible();
    await expect(home.logo).toHaveAttribute('href', '/');

    const logo = await home.boxOf(home.logo, 'logo');
    expect(logo.width, 'the logo should have a real rendered width').toBeGreaterThan(0);
    expect(logo.height, 'the logo should have a real rendered height').toBeGreaterThan(0);
  });

  test('TC-W-002 (P) the Sign in control is displayed and operable', async ({ home }) => {
    await expect(home.signIn).toBeVisible();
    await expect(home.signIn).toBeEnabled();
  });

  test('TC-W-003 (P) the logo is positioned inside the header band, in the top-left quadrant', async ({ home, isMobile }) => {
    const header = await home.boxOf(home.header, 'header');
    const logo = await home.boxOf(home.logo, 'logo');
    const viewport = home.viewport();

    // Vertically contained by the header, with a 1px allowance for sub-pixel layout.
    expect.soft(logo.y, 'the logo should start at or below the top of the header').toBeGreaterThanOrEqual(header.y - 1);
    expect.soft(logo.bottom, 'the logo should end at or above the bottom of the header').toBeLessThanOrEqual(header.bottom + 1);

    /**
     * The logo is LEFT-ALIGNED — that is the invariant that holds at every
     * width. "Ends within the left half" only holds on a wide viewport: at
     * 393px the logo is 148px wide and naturally crosses the midpoint without
     * anything being wrong. Asserting the strong form everywhere was a flaw in
     * this test, not a defect in the site.
     */
    expect.soft(logo.x, 'the logo should START within the left half of the viewport').toBeLessThan(viewport.width / 2);
    if (!isMobile) {
      expect.soft(logo.right, 'on desktop the logo should sit ENTIRELY within the left half').toBeLessThan(viewport.width / 2);
    }

    // Near the top of the page, not scrolled away down the document.
    expect.soft(logo.y, 'the logo should be near the top of the page').toBeLessThan(isMobile ? 200 : 150);
  });

  test('TC-W-004 (P) Sign in is anchored to the top-right of the header', async ({ home, isMobile }) => {
    test.skip(isMobile, 'On mobile the account control collapses into the navigation drawer.');

    const header = await home.boxOf(home.header, 'header');
    const signIn = await home.boxOf(home.signIn, 'sign in');
    const viewport = home.viewport();

    expect.soft(signIn.x, 'Sign in should sit in the right half of the viewport').toBeGreaterThan(viewport.width / 2);
    expect.soft(viewport.width - signIn.right, 'Sign in should be flush to the right edge of the header').toBeLessThanOrEqual(48);
    expect.soft(signIn.y, 'Sign in should start at or below the top of the header').toBeGreaterThanOrEqual(header.y - 1);
    expect.soft(signIn.bottom, 'Sign in should end at or above the bottom of the header').toBeLessThanOrEqual(header.bottom + 1);
  });

  test('TC-W-005 (P) the logo and Sign in share a horizontal axis and do not overlap', async ({ home, isMobile }) => {
    test.skip(isMobile, 'On mobile the account control collapses into the navigation drawer.');

    const logo = await home.boxOf(home.logo, 'logo');
    const signIn = await home.boxOf(home.signIn, 'sign in');

    // Same optical row: centres aligned within a small tolerance.
    // Recon measured a 2px delta (logo centre 42, sign in centre 40).
    expect.soft(
      Math.abs(logo.centreY - signIn.centreY),
      'the logo and Sign in should be vertically centre-aligned on the same row',
    ).toBeLessThanOrEqual(8);

    // Reading order: logo precedes Sign in, and the two never collide.
    expect.soft(logo.right, 'the logo should end before Sign in begins — they must not overlap').toBeLessThanOrEqual(signIn.x);
  });

  test('TC-W-006 (P) the logo sits to the right of the navigation toggle', async ({ home }) => {
    const nav = await home.boxOf(home.navigationToggle, 'navigation toggle');
    const logo = await home.boxOf(home.logo, 'logo');

    expect(logo.x, 'the logo should follow the navigation toggle in reading order').toBeGreaterThanOrEqual(nav.right - 1);
  });

  test('TC-W-007 (P) header elements are fully inside the viewport, not clipped or off-screen', async ({ home, isMobile }) => {
    const viewport = home.viewport();

    const targets: Array<{ name: string; box: Awaited<ReturnType<typeof home.boxOf>> }> = [
      { name: 'logo', box: await home.boxOf(home.logo, 'logo') },
    ];
    if (!isMobile) {
      targets.push({ name: 'sign in', box: await home.boxOf(home.signIn, 'sign in') });
    }

    for (const { name, box } of targets) {
      expect.soft(box.x, `${name} should not overflow the left edge`).toBeGreaterThanOrEqual(0);
      expect.soft(box.y, `${name} should not overflow the top edge`).toBeGreaterThanOrEqual(0);
      expect.soft(box.right, `${name} should not overflow the right edge`).toBeLessThanOrEqual(viewport.width);
      expect.soft(box.bottom, `${name} should be above the fold`).toBeLessThanOrEqual(viewport.height);
    }
  });

  test('TC-W-008 (P) the header spans the full width of the viewport', async ({ home }) => {
    const header = await home.boxOf(home.header, 'header');
    const viewport = home.viewport();

    expect.soft(header.x, 'the header should start at the left edge').toBeLessThanOrEqual(1);
    expect.soft(header.width, 'the header should span the full viewport width').toBeGreaterThanOrEqual(viewport.width - 2);
    expect.soft(header.height, 'the header should have a real rendered height').toBeGreaterThan(0);
  });

  test('TC-W-009 (N) the header survives a narrow viewport without the logo overflowing', async ({ home, page, isMobile }) => {
    test.skip(isMobile, 'Already running at a mobile viewport in the web-mobile project.');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(home.logo).toBeVisible();

    const logo = await home.boxOf(home.logo, 'logo');
    expect.soft(logo.x, 'the logo should not be pushed off the left edge at 375px').toBeGreaterThanOrEqual(0);
    expect.soft(logo.right, 'the logo should not overflow the right edge at 375px').toBeLessThanOrEqual(375);
  });

  test('TC-W-010 (N) a non-existent header control is correctly reported as absent', async ({ page }) => {
    // Guards against a false-confidence suite: proves the locators can fail.
    await expect(page.getByRole('button', { name: 'Definitely Not A Real Button' })).toHaveCount(0);
  });
});
