import { test, expect } from './fixtures/api.fixture';
import { aBooking, isoDate } from './data/booking.factory';
import type { CreatedBooking } from './clients/booking.client';

/**
 * The defect report, made executable.
 *
 * Every test here asserts the behaviour the API *should* have, and every one is
 * marked `test.fail()` — "this is expected to fail". That gives three things at
 * once:
 *
 *   1. The assertion documents the CORRECT contract, not the broken one. Anyone
 *      reading `toBe(201)` sees what a compliant API would return.
 *   2. The suite stays green while the defects exist, so it remains a
 *      regression net people trust rather than a wall of red they learn to
 *      ignore.
 *   3. The moment a defect is FIXED upstream, its test starts passing —
 *      and Playwright reports an expected-failure-that-passed as a failure.
 *      The build goes red and forces someone to retire the workaround, which
 *      is exactly when you want to be told.
 *
 * This is the counterpart to the functional specs. Those pin what the API does
 * TODAY, so a silent behaviour change is caught. These pin what it SHOULD do.
 * Neither alone is sufficient.
 *
 * Known limitation: a `test.fail()` test that fails for an unrelated reason —
 * a network blip, the sandbox being down — still counts as an expected failure
 * and would mask that. It is the price of the pattern, and the reason these
 * were added alongside the functional tests rather than replacing them.
 *
 * Full write-ups with reproductions: docs/defects.md
 */
test.describe('Known defects — the behaviour the API should have', () => {
  test('DEFECT-001 (High-visibility) POST /booking should return 201 Created', async ({ booking }) => {
    test.fail();
    const response = await booking.create(aBooking());
    expect(response.status(), 'creating a resource should answer 201 Created').toBe(201);
  });

  test('DEFECT-002 DELETE /booking/{id} should return 200 or 204, not 201 Created', async ({ booking, token }) => {
    test.fail();
    const created = await booking.seedBooking(aBooking());
    const response = await booking.remove(created.bookingid, token);
    expect([200, 204], `a deletion answered ${response.status()}; 201 Created is for creation`)
      .toContain(response.status());
  });

  test('DEFECT-003 a repeat DELETE should return 404, keeping DELETE idempotent', async ({ booking, token }) => {
    test.fail();
    const created = await booking.seedBooking(aBooking());
    await booking.remove(created.bookingid, token);

    const second = await booking.remove(created.bookingid, token);
    expect(second.status(), 'DELETE must be idempotent; 405 claims the method is unsupported').toBe(404);
  });

  test('DEFECT-004 a payload missing required fields should return 400, not 500', async ({ booking }) => {
    test.fail();
    const response = await booking.create({ firstname: 'OnlyAFirstName' });
    expect(response.status(), 'a malformed client request is a 400; a 500 blames the server').toBe(400);
  });

  test('DEFECT-005 wrongly typed fields should be rejected, not silently corrupted', async ({ booking }) => {
    test.fail();
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
    test.fail();
    const response = await booking.create(aBooking({ totalprice: -500 }));
    expect(response.status(), 'a booking cannot cost a negative amount').toBe(400);
  });

  test('DEFECT-007 a checkout before the checkin should be rejected', async ({ booking }) => {
    test.fail();
    const response = await booking.create(
      aBooking({ bookingdates: { checkin: isoDate(60), checkout: isoDate(10) } }),
    );
    expect(response.status(), 'a stay cannot have negative length').toBe(400);
  });

  test('DEFECT-008 script content should not be stored and reflected verbatim', async ({ booking }) => {
    test.fail();
    const payload = '<script>alert(1)</script>';
    const response = await booking.create(aBooking({ firstname: payload }));
    const body = (await response.json()) as CreatedBooking;

    expect(body.booking.firstname, 'input should be sanitised or encoded at the boundary').not.toBe(payload);
  });

  test('DEFECT-009 POST /auth should return 401 for bad credentials', async ({ booking }) => {
    test.fail();
    const response = await booking.createTokenResponse('admin', 'definitely-the-wrong-password');
    expect(response.status(), 'a client must not have to parse the body to detect an auth failure').toBe(401);
  });

  test('DEFECT-010 a write without credentials should return 401, not 403', async ({ booking }) => {
    test.fail();
    const created = await booking.seedBooking(aBooking());
    const response = await booking.update(created.bookingid, aBooking());

    expect(response.status(), '401 is "who are you?"; 403 is "I know you and no"').toBe(401);
  });

  test('DEFECT-011 error bodies should honour Accept: application/json', async ({ booking }) => {
    test.fail();
    const response = await booking.getById(999_999_999);
    expect(response.headers()['content-type'], 'a JSON client should not have to special-case error parsing')
      .toContain('application/json');
  });

  test('DEFECT-012 a write to an unknown id should return 404, not 405', async ({ booking, token }) => {
    test.fail();
    const response = await booking.update(999_999_999, aBooking(), token);
    expect(response.status(), '405 means the method is unsupported on a resource that exists').toBe(404);
  });
});
