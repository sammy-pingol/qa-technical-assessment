import { test, expect } from './fixtures/api.fixture';
import { aBooking } from './data/booking.factory';
import { timed } from './support/assertions';

/**
 * Response-time budgets.
 *
 * These are deliberately generous. restful-booker is a free public sandbox on
 * shared infrastructure, and the goal is NOT to police latency — a tight budget
 * would fail on someone else's traffic and get muted within a week, which is
 * how performance assertions usually die.
 *
 * The goal is to catch a STEP CHANGE: an endpoint that went from ~1s to ~8s has
 * regressed in a way a purely functional suite would pass straight over. A read
 * gets a tighter budget than a write because it does less work; if a read ever
 * takes longer than a write, something is wrong regardless of the absolute
 * numbers.
 *
 * Against a service we owned these would be tied to an agreed SLO rather than
 * picked by me, and I would assert a percentile across many calls rather than a
 * single sample.
 */
const WRITE_BUDGET_MS = 6_000;
const READ_BUDGET_MS = 4_000;

test.describe('Performance — response-time budgets', () => {
  test('TC-A-050 (P) authentication responds within budget', async ({ booking }) => {
    const { result, ms } = await timed(() => booking.createTokenResponse('admin', 'password123'));

    expect(result.status(), 'the call should succeed before its timing means anything').toBe(200);
    expect(ms, `POST /auth took ${ms}ms, over the ${WRITE_BUDGET_MS}ms budget`).toBeLessThan(WRITE_BUDGET_MS);
  });

  test('TC-A-051 (P) creating a booking responds within budget', async ({ booking }) => {
    const { result, ms } = await timed(() => booking.create(aBooking()));

    expect(result.ok(), 'the call should succeed before its timing means anything').toBe(true);
    expect(ms, `POST /booking took ${ms}ms, over the ${WRITE_BUDGET_MS}ms budget`).toBeLessThan(WRITE_BUDGET_MS);
  });

  test('TC-A-052 (P) reading a booking responds within budget, and faster than writing it', async ({ booking }) => {
    const created = await timed(() => booking.seedBooking(aBooking()));
    const read = await timed(() => booking.getById(created.result.bookingid));

    expect(read.result.status(), 'the call should succeed before its timing means anything').toBe(200);
    expect(read.ms, `GET /booking/{id} took ${read.ms}ms, over the ${READ_BUDGET_MS}ms budget`).toBeLessThan(READ_BUDGET_MS);

    // Relative check: a read does strictly less work than a write, so it should
    // not be slower. This holds even when the absolute numbers drift.
    expect
      .soft(read.ms, `a read (${read.ms}ms) should not be slower than the write that created it (${created.ms}ms)`)
      .toBeLessThanOrEqual(created.ms + 1_000);
  });
});
