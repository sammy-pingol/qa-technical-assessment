import { test, expect } from './fixtures/api.fixture';
import { aBooking } from './data/booking.factory';
import { expectBookingEquals, expectValidBookingShape, flagDefect } from './support/assertions';

/** Case study 2c — GetBooking, GET /booking and GET /booking/{id}. */
test.describe('GetBooking — GET /booking/{id}', () => {
  test('TC-A-030 (P) an existing booking is returned with every documented field', async ({ booking }) => {
    const payload = aBooking();
    const created = await booking.seedBooking(payload);

    const response = await booking.getById(created.bookingid);

    expect(response.status(), 'an existing booking should be returned').toBe(200);
    expect(response.headers()['content-type'], 'the response should be JSON').toContain('application/json');

    const body = await response.json();
    expectValidBookingShape(body, 'retrieved booking');
    expectBookingEquals(body, payload, 'retrieved booking');
  });

  test('TC-A-031 (P) the response contains only the documented fields', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking());
    const body = (await (await booking.getById(created.bookingid)).json()) as Record<string, unknown>;

    const allowed = ['firstname', 'lastname', 'totalprice', 'depositpaid', 'bookingdates', 'additionalneeds'];
    const unexpected = Object.keys(body).filter((key) => !allowed.includes(key));

    expect(unexpected, 'the payload should not leak undocumented fields').toEqual([]);
    expect(body, 'the record must not echo an internal id back inside the booking object').not.toHaveProperty('bookingid');
  });

  test('TC-A-032 (P) GET /booking returns a list of booking ids', async ({ booking }) => {
    await booking.seedBooking(aBooking());
    const response = await booking.list();

    expect(response.status(), 'the booking index should be readable').toBe(200);

    const body = (await response.json()) as Array<{ bookingid: number }>;
    expect(Array.isArray(body), 'the index should be an array').toBe(true);
    expect(body.length, 'the index should not be empty after seeding a booking').toBeGreaterThan(0);
    expect(typeof body[0].bookingid, 'each entry should carry a numeric bookingid').toBe('number');
  });

  test('TC-A-033 (P) GET /booking filtered by name returns only matching bookings', async ({ booking }) => {
    const payload = aBooking();
    await booking.seedBooking(payload);

    const response = await booking.list({ firstname: payload.firstname, lastname: payload.lastname });
    expect(response.status(), 'a filtered index query should succeed').toBe(200);

    const ids = (await response.json()) as Array<{ bookingid: number }>;
    expect(ids.length, 'the freshly created booking should be findable by name').toBeGreaterThan(0);

    const first = await (await booking.getById(ids[0].bookingid)).json();
    expect(first.firstname, 'the filter should only return matching records').toBe(payload.firstname);
  });

  test('TC-A-034 (N) a non-existent booking id returns 404', async ({ booking }) => {
    const response = await booking.getById(999_999_999);

    expect(response.status(), 'an unknown booking id should be reported as not found').toBe(404);

    flagDefect(
      'DEFECT-011',
      'Error responses are text/plain ("Not Found") even when the request sends Accept: application/json. '
      + 'A JSON client must special-case error parsing because content negotiation is not honoured.',
    );
    expect(response.headers()['content-type'], 'documenting the actual content type — see DEFECT-011').toContain('text/plain');
  });

  test('TC-A-035 (N) a non-numeric booking id returns 404 rather than an error', async ({ booking }) => {
    const response = await booking.getById('not-a-valid-id');
    expect(response.status(), 'a malformed id should be rejected, not crash the service').toBe(404);
  });

  test('TC-A-036 (N) a deleted booking is no longer retrievable', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    await booking.remove(created.bookingid, token);

    const response = await booking.getById(created.bookingid);
    expect(response.status(), 'a deleted booking must not be readable').toBe(404);
  });
});
