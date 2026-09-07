import { defineConfig, devices } from '@playwright/test';

/**
 * Two projects share one runner, one reporter and one trace viewer:
 *   api  — no browser is launched; uses Playwright's APIRequestContext
 *   web  — Chromium against cheapflights.com.au
 *
 * Base URLs are env-overridable so the same suite can be pointed at a staging
 * host without touching code.
 */
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://www.cheapflights.com.au';
const API_BASE_URL = process.env.API_BASE_URL ?? 'https://restful-booker.herokuapp.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  /**
   * cheapflights.com.au is a live third-party site behind a WAF, with A/B tested
   * layouts and ad iframes. One retry locally, two in CI, distinguishes a real
   * regression from third-party noise. Every retry captures a trace.
   */
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,

  /**
   * 120s: a form-driven search on the live site involves an autocomplete
   * round-trip per airport, a calendar interaction, a full navigation, and a
   * results stream that settles progressively. 90s was marginal under parallel
   * load and produced timeouts that were infrastructure, not defects.
   */
  timeout: 120_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      // The known-defects suite is its own project — see below.
      testIgnore: /known-defects\.spec\.ts/,
      use: {
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { 'Content-Type': 'application/json', Accept: 'application/json' },
      },
    },
    {
      /**
       * The executable defect report. EXPECTED TO FAIL — one failure per open
       * defect — which is why it is a separate project and is not part of
       * `npm test`.
       *
       * Run it with `npm run test:defects`. A test going green here means the
       * API was fixed and the corresponding entry in docs/defects.md can be
       * closed.
       *
       * No retries: these failures are the deterministic, expected result, and
       * retrying them would only waste time.
       */
      name: 'defects',
      testDir: './tests/api',
      testMatch: /known-defects\.spec\.ts/,
      retries: 0,
      use: {
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { 'Content-Type': 'application/json', Accept: 'application/json' },
      },
    },
    {
      name: 'web',
      testDir: './tests/web',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_BASE_URL,
        /**
         * Pinned viewport: the position assertions in header.spec.ts are
         * expressed as layout INVARIANTS, but a fixed viewport keeps the
         * failure diagnostics reproducible. See docs/site-recon.md.
         */
        viewport: { width: 1440, height: 900 },
        /**
         * The site geolocates its default origin airport (it pre-filled
         * "Manila (MNL)" during recon from a PH IP). Locale and timezone are
         * pinned so the reviewer sees the same formatting we did; the specs
         * additionally never rely on any default value.
         */
        locale: 'en-AU',
        timezoneId: 'Australia/Sydney',
      },
    },
    {
      name: 'web-mobile',
      testDir: './tests/web',
      testMatch: /header\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: WEB_BASE_URL },
    },
  ],
});
