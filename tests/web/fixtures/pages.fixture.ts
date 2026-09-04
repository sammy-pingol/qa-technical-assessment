import { test as base } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { ResultsPage } from '../pages/results.page';

/**
 * Page objects delivered as fixtures rather than constructed in beforeEach:
 * a spec declares only the pages it actually uses, and Playwright handles the
 * per-test lifecycle. Each test also gets a fresh browser context, which matters
 * here because the site persists "recent searches" between visits.
 */
export const test = base.extend<{ home: HomePage; results: ResultsPage }>({
  home: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  results: async ({ page }, use) => {
    await use(new ResultsPage(page));
  },
});

export { expect } from '@playwright/test';
