import { test, expect } from './fixtures/api.fixture';
import { aBooking } from './data/booking.factory';
import { flagDefect } from './support/assertions';

/** Case study 2d — DeleteBooking, DELETE /booking/{id}. */
test.describe('DeleteBooking — DELETE /booking/{id}', () => {
  test('TC-A-040 (P) an authenticated delete removes the booking', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());

    const response = await booking.remove(created.bookingid, token);
    expect(response.ok(), 'an authenticated delete should succeed').toBe(true);

    flagDefect(
      'DEFECT-002',
      'DELETE /booking/{id} returns HTTP 201 Created with the reason phrase "Created" for a successful '
      + 'deletion. 200 OK or 204 No Content is correct; 201 tells the client a resource was created.',
    );
    expect(response.status(), 'documenting the actual (incorrect) status — see DEFECT-002').toBe(201);
  });

  test('TC-A-041 (P) the deleted booking is gone and stays gone', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    await booking.remove(created.bookingid, token);

    const readBack = await booking.getById(created.bookingid);
    expect(readBack.status(), 'a deleted booking must not be retrievable').toBe(404);
  });

  test('TC-A-042 (P) deleting one booking does not affect another', async ({ booking, token }) => {
    const doomed = await booking.seedBooking(aBooking());
    const survivor = await booking.seedBooking(aBooking());

    await booking.remove(doomed.bookingid, token);

    const survivorResponse = await booking.getById(survivor.bookingid);
    expect(survivorResponse.status(), 'an unrelated booking must survive the delete').toBe(200);
  });

  test('TC-A-043 (N) a delete without a token is refused and the booking survives', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking());

    const response = await booking.remove(created.bookingid);
    expect(response.status(), 'an unauthenticated delete must be refused').toBe(403);

    const readBack = await booking.getById(created.bookingid);
    expect(readBack.status(), 'the booking must still exist after a refused delete').toBe(200);
  });

  test('TC-A-044 (N) a delete with an invalid token is refused', async ({ booking }) => {
    const created = await booking.seedBooking(aBooking());

    const response = await booking.remove(created.bookingid, 'forged-token-value');
    expect(response.status(), 'a forged token must be refused').toBe(403);

    const readBack = await booking.getById(created.bookingid);
    expect(readBack.status(), 'the booking must still exist after a refused delete').toBe(200);
  });

  test('TC-A-045 (N) deleting the same booking twice is not reported as a fresh success', async ({ booking, token }) => {
    const created = await booking.seedBooking(aBooking());
    await booking.remove(created.bookingid, token);

    const second = await booking.remove(created.bookingid, token);
    expect(second.ok(), 'a repeat delete must not report success').toBe(false);

    flagDefect(
      'DEFECT-003',
      'A repeat DELETE of an already-deleted booking returns 405 Method Not Allowed instead of 404 Not '
      + 'Found. DELETE is required to be idempotent; 405 implies the method itself is unsupported, which '
      + 'is misleading and breaks retry-safe clients.',
    );
    expect(second.status(), 'documenting the actual status — see DEFECT-003').toBe(405);
  });

  test('TC-A-046 (N) deleting a non-existent booking is refused', async ({ booking, token }) => {
    const response = await booking.remove(999_999_999, token);
    expect(response.ok(), 'deleting an unknown id must not report success').toBe(false);
  });
});
