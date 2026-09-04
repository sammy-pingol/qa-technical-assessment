import { test, expect } from './fixtures/api.fixture';
import { aBooking, isoDate } from './data/booking.factory';
import { expectBookingEquals, expectValidBookingShape, flagDefect } from './support/assertions';

/** Case study 2b — UpdateBooking, PUT /booking/{id} and PATCH /booking/{id}. */
test.describe('UpdateBooking — PUT / PATCH /booking/{id}', () => {
  test('TC-A-020 (P) an authenticated full update replaces every field', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    const replacement = aBooking({
      totalprice: 999,
      depositpaid: false,
      bookingdates: { checkin: isoDate(40), checkout: isoDate(47) },
      additionalneeds: 'Late checkout',
    });

    const response = await booking.update(created.bookingid, replacement, token);

    expect(response.status(), 'an authenticated update should succeed').toBe(200);
    expect(response.headers()['content-type'], 'the response should be JSON').toContain('application/json');

    const body = await response.json();
    expectValidBookingShape(body, 'updated booking');
    expectBookingEquals(body, replacement, 'updated booking');
  });

  test('TC-A-021 (P) the update is persisted, not just echoed', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    const replacement = aBooking({ firstname: 'Persisted', totalprice: 777 });

    await booking.update(created.bookingid, replacement, token);
    const readBack = await (await booking.getById(created.bookingid)).json();

    expect(readBack.firstname, 'the update should survive a fresh read').toBe('Persisted');
    expect(readBack.totalprice, 'the updated price should survive a fresh read').toBe(777);
  });

  test('TC-A-022 (P) a PATCH updates only the supplied field and leaves the rest intact', async ({ booking, token }) => {
    const original = aBooking();
    const created = await booking.seedBooking(original);

    const response = await booking.partialUpdate(created.bookingid, { firstname: 'PatchedName' }, token);

    expect(response.status(), 'an authenticated partial update should succeed').toBe(200);

    const body = await response.json();
    expect(body.firstname, 'the patched field should change').toBe('PatchedName');
    expect(body.lastname, 'an unpatched field must be preserved').toBe(original.lastname);
    expect(body.totalprice, 'an unpatched field must be preserved').toBe(original.totalprice);
    expect(body.bookingdates, 'an unpatched object must be preserved').toEqual(original.bookingdates);
  });

  test('TC-A-023 (N) an update without a token is rejected and changes nothing', async ({ booking }) => {
    const original = aBooking();
    const created = await booking.seedBooking(original);

    const response = await booking.update(created.bookingid, aBooking({ firstname: 'Unauthorised' }));

    expect(response.ok(), 'an unauthenticated update must be refused').toBe(false);

    // The important half: the refusal actually protected the data.
    const readBack = await (await booking.getById(created.bookingid)).json();
    expect(readBack.firstname, 'the record must be unchanged after a refused update').toBe(original.firstname);

    flagDefect(
      'DEFECT-010',
      'PUT/DELETE /booking/{id} return 403 Forbidden when no credentials are supplied. RFC 9110 specifies '
      + '401 Unauthorized for missing or invalid authentication, with 403 reserved for an authenticated '
      + 'principal lacking permission. No WWW-Authenticate header is returned either.',
    );
    expect(response.status(), 'documenting the actual status — see DEFECT-010').toBe(403);
  });

  test('TC-A-024 (N) an update with an invalid token is rejected', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking());
    const response = await booking.update(created.bookingid, aBooking(), 'clearly-not-a-real-token');

    expect(response.status(), 'a forged token must be refused').toBe(403);
  });

  test('TC-A-025 (N) a full update with a partial payload is rejected', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    const response = await booking.update(created.bookingid, { firstname: 'OnlyAName' }, token);

    // PUT is a full replacement, so an incomplete body is correctly a 400.
    expect(response.status(), 'PUT with an incomplete body should be a bad request').toBe(400);
  });

  test('TC-A-026 (N) updating a non-existent booking does not create one', async ({ booking, token }) => {
    const response = await booking.update(999_999_999, aBooking(), token);

    expect(response.ok(), 'updating an unknown id must not succeed').toBe(false);
    expect(response.status(), 'an unknown booking id should be reported as not found').toBe(405);

    flagDefect(
      'DEFECT-012',
      'PUT /booking/{id} for a non-existent id returns 405 Method Not Allowed rather than 404 Not Found. '
      + '405 implies the method is unsupported on a resource that exists, which misleads clients.',
    );
  });
});
