import { test, expect } from './fixtures/api.fixture';
import { aBooking, isoDate } from './data/booking.factory';
import { expectBookingEquals, expectValidBookingShape, flagDefect } from './support/assertions';
import type { CreatedBooking } from './clients/booking.client';

/** Case study 2a — CreateBooking, POST /booking. */
test.describe('CreateBooking — POST /booking', () => {
  test('TC-A-010 (P) a valid booking is created and echoed back in full', async ({ booking }) => {
    const payload = aBooking();
    const response = await booking.create(payload);

    expect(response.ok(), 'a valid booking should be accepted').toBe(true);
    expect(response.headers()['content-type'], 'the response should be JSON').toContain('application/json');

    const body = (await response.json()) as CreatedBooking;

    // Response field assertions — the created id...
    expect(typeof body.bookingid, 'bookingid should be a number').toBe('number');
    expect(body.bookingid, 'bookingid should be a positive identifier').toBeGreaterThan(0);

    // ...and every field of the nested booking.
    expectValidBookingShape(body.booking, 'booking');
    expectBookingEquals(body.booking, payload, 'booking');

    flagDefect(
      'DEFECT-001',
      'POST /booking returns HTTP 200 instead of 201 Created, and returns no Location header '
      + 'for the newly created resource.',
    );
    expect(response.status(), 'documenting the actual (non-standard) status — see DEFECT-001').toBe(200);
  });

  test('TC-A-011 (P) a booking created without additionalneeds is still valid', async ({ booking }) => {
    const payload = aBooking();
    delete (payload as { additionalneeds?: string }).additionalneeds;

    const response = await booking.create(payload);
    expect(response.ok(), 'additionalneeds is optional and its absence should be accepted').toBe(true);

    const body = (await response.json()) as CreatedBooking;
    expect(body.booking.firstname, 'the booking should still round-trip').toBe(payload.firstname);
  });

  test('TC-A-012 (P) a created booking is immediately retrievable', async ({ booking }) => {
    const payload = aBooking();
    const created = await booking.seedBooking(payload);

    const readBack = await booking.getById(created.bookingid);
    expect(readBack.status(), 'a booking should be readable straight after creation').toBe(200);
    expectBookingEquals(await readBack.json(), payload, 'persisted booking');
  });

  test('TC-A-013 (P) depositpaid false is persisted as false, not coerced', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking({ depositpaid: false }));
    expect(created.booking.depositpaid, 'a false boolean must survive the round-trip').toBe(false);
  });

  test('TC-A-014 (N) a payload missing required fields is rejected', async ({ booking }) => {
    const response = await booking.create({ firstname: 'OnlyAFirstName' });

    expect(response.ok(), 'an incomplete booking must not be accepted').toBe(false);

    flagDefect(
      'DEFECT-004',
      'POST /booking returns HTTP 500 Internal Server Error for a payload missing required fields, '
      + 'where 400 Bad Request is correct. The body is text/plain even when Accept: application/json '
      + 'is sent, and carries no field-level validation detail.',
    );
    expect(response.status(), 'documenting the actual status — see DEFECT-004').toBe(500);
  });

  test('TC-A-015 (N) an empty payload is rejected', async ({ booking }) => {
    const response = await booking.create({});
    expect(response.ok(), 'an empty booking must not be accepted').toBe(false);
  });

  test('TC-A-016 (N) wrongly typed fields are not silently corrupted', async ({ booking }) => {
    const response = await booking.create({
      firstname: 'TypeCheck',
      lastname: 'Probe',
      totalprice: 'not-a-number',
      depositpaid: 'maybe',
      bookingdates: { checkin: isoDate(5), checkout: isoDate(9) },
    });

    const body = (await response.json()) as CreatedBooking;

    flagDefect(
      'DEFECT-005',
      'POST /booking accepts wrongly typed fields with HTTP 200. totalprice:"not-a-number" is silently '
      + 'stored as null and depositpaid:"maybe" is coerced to true. This is silent data corruption: the '
      + 'caller receives a success response for a booking that no longer means what they sent.',
    );

    // Assert the corruption explicitly so the defect is visible in the report
    // and so a future fix (a 400) fails this test and forces a review.
    expect(response.status(), 'documenting the actual status — see DEFECT-005').toBe(200);
    expect(body.booking.totalprice, 'DEFECT-005: an unparseable price is stored as null').toBeNull();
  });

  test('TC-A-017 (N) a negative total price is not accepted as a valid fare', async ({ booking }) => {
    const response = await booking.create(aBooking({ totalprice: -500 }));
    const body = (await response.json()) as CreatedBooking;

    flagDefect(
      'DEFECT-006',
      'POST /booking accepts a negative totalprice (-500) with HTTP 200. There is no lower-bound '
      + 'validation on monetary values.',
    );
    expect(body.booking.totalprice, 'documenting the accepted negative price — see DEFECT-006').toBe(-500);
  });

  test('TC-A-018 (N) a checkout date before the checkin date is not accepted', async ({ booking }) => {
    const response = await booking.create(
      aBooking({ bookingdates: { checkin: isoDate(60), checkout: isoDate(10) } }),
    );
    const body = (await response.json()) as CreatedBooking;

    flagDefect(
      'DEFECT-007',
      'POST /booking accepts a booking whose checkout date precedes its checkin date, with HTTP 200. '
      + 'No chronological business-rule validation is applied.',
    );
    expect(new Date(body.booking.bookingdates.checkout).getTime(), 'documenting the inverted date range — see DEFECT-007')
      .toBeLessThan(new Date(body.booking.bookingdates.checkin).getTime());
  });

  test('TC-A-019 (N) script content in a name field is not stored unescaped', async ({ booking }) => {
    const payload = '<script>alert(1)</script>';
    const created = await booking.seedBooking(aBooking({ firstname: payload }));

    flagDefect(
      'DEFECT-008',
      'POST /booking stores and reflects an unsanitised <script> payload in firstname. The API performs '
      + 'no input sanitisation or output encoding, so any consumer rendering this field as HTML inherits '
      + 'a stored XSS. Severity depends on the consumer, but the API should not be the weak link.',
    );
    expect(created.booking.firstname, 'documenting the unsanitised round-trip — see DEFECT-008').toBe(payload);
  });
});
