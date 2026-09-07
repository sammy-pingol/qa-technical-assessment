import { test, expect } from './fixtures/api.fixture';
import { aBooking, isoDate } from './data/booking.factory';
import type { CreatedBooking } from './clients/booking.client';

/**
 * The defect report, made executable.
 *
 * Every test here asserts the behaviour the API *should* have, so every one of
 * them FAILS while the defect is open. That is the intended state, and it is
 * the honest one: a red result means something is wrong, and twelve things are.
 * When a defect is fixed, its test simply goes green — no annotation to retire,
 * no inverted signal to explain.
 *
 * This suite is a separate Playwright project (`defects`) and is deliberately
 * NOT part of `npm test`. That separation is the whole trick:
 *
 *   npm test           -> functional suites only. Expected GREEN.
 *                         Red here means something NEW broke.
 *   npm run test:defects -> this suite. Expected RED, one failure per open bug.
 *                         Green here means a defect was fixed.
 *
 * Keeping them apart is what stops twelve permanent failures from drowning out
 * a thirteenth, genuinely new one — which is the usual argument against letting
 * known bugs sit red, and it is solved by separation rather than by dressing the
 * failures up as passes.
 *
 * The functional specs still pin what the API does TODAY, each carrying a
 * flagDefect() annotation. Between the two, a silent behaviour change fails the
 * functional suite and an upstream fix turns a test in this one green.
 *
 * Full write-ups with reproductions: docs/defects.md
 */
test.describe('Known defects — these SHOULD fail until the API is fixed', () => {
  test('DEFECT-001 (High-visibility) POST /booking should return 201 Created', async ({ booking }) => {
    const response = await booking.create(aBooking());
    expect(response.status(), 'creating a resource should answer 201 Created').toBe(201);
  });

  test('DEFECT-002 DELETE /booking/{id} should return 200 or 204, not 201 Created', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    const response = await booking.remove(created.bookingid, token);
    expect([200, 204], `a deletion answered ${response.status()}; 201 Created is for creation`)
      .toContain(response.status());
  });

  test('DEFECT-003 a repeat DELETE should return 404, keeping DELETE idempotent', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    await booking.remove(created.bookingid, token);

    const second = await booking.remove(created.bookingid, token);
    expect(second.status(), 'DELETE must be idempotent; 405 claims the method is unsupported').toBe(404);
  });

  test('DEFECT-004 a payload missing required fields should return 400, not 500', async ({ booking }) => {
    const response = await booking.create({ firstname: 'OnlyAFirstName' });
    expect(response.status(), 'a malformed client request is a 400; a 500 blames the server').toBe(400);
  });

  test('DEFECT-005 wrongly typed fields should be rejected, not silently corrupted', async ({ booking }) => {
    const response = await booking.create({
      firstname: 'TypeCheck',
      lastname: 'Probe',
      totalprice: 'not-a-number',
      depositpaid: 'maybe',
      bookingdates: { checkin: isoDate(5), checkout: isoDate(9) },
    });
    expect(response.status(), 'an unparseable price should be refused, not stored as null').toBe(400);
  });

  test('DEFECT-006 a negative total price should be rejected', async ({ booking }) => {
    const response = await booking.create(aBooking({ totalprice: -500 }));
    expect(response.status(), 'a booking cannot cost a negative amount').toBe(400);
  });

  test('DEFECT-007 a checkout before the checkin should be rejected', async ({ booking }) => {
    const response = await booking.create(
      aBooking({ bookingdates: { checkin: isoDate(60), checkout: isoDate(10) } }),
    );
    expect(response.status(), 'a stay cannot have negative length').toBe(400);
  });

  test('DEFECT-008 script content should not be stored and reflected verbatim', async ({ booking }) => {
    const payload = '<script>alert(1)</script>';
    const response = await booking.create(aBooking({ firstname: payload }));
    const body = (await response.json()) as CreatedBooking;

    expect(body.booking.firstname, 'input should be sanitised or encoded at the boundary').not.toBe(payload);
  });

  test('DEFECT-009 POST /auth should return 401 for bad credentials', async ({ booking }) => {
    const response = await booking.createTokenResponse('admin', 'definitely-the-wrong-password');
    expect(response.status(), 'a client must not have to parse the body to detect an auth failure').toBe(401);
  });

  test('DEFECT-010 a write without credentials should return 401, not 403', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking());
    const response = await booking.update(created.bookingid, aBooking());

    expect(response.status(), '401 is "who are you?"; 403 is "I know you and no"').toBe(401);
  });

  test('DEFECT-011 error bodies should honour Accept: application/json', async ({ booking }) => {
    const response = await booking.getById(999_999_999);
    expect(response.headers()['content-type'], 'a JSON client should not have to special-case error parsing')
      .toContain('application/json');
  });

  test('DEFECT-012 a write to an unknown id should return 404, not 405', async ({ booking, token }) => {
    const response = await booking.update(999_999_999, aBooking(), token);
    expect(response.status(), '405 means the method is unsupported on a resource that exists').toBe(404);
  });
});
