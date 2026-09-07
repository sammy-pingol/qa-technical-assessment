import { expect, test } from '@playwright/test';
import type { Booking } from '../clients/booking.client';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Record a known API defect against the running test.
 *
 * Several endpoints deviate from their own documentation and from HTTP
 * convention. Rather than let the suite fail on behaviour we cannot change, each
 * spec asserts the ACTUAL behaviour — so it remains a working regression net —
 * and flags the deviation here. The annotation surfaces in the HTML report, and
 * every id is written up with reproduction steps in docs/defects.md.
 */
export function flagDefect(id: string, description: string): void {
  test.info().annotations.push({ type: `defect: ${id}`, description });
}

/**
 * Full response-body shape check for a booking object: presence, type and
 * format of every documented field. Called by every endpoint spec so a change
 * to the contract fails in one obvious place.
 */
export function expectValidBookingShape(value: unknown, context = 'booking'): void {
  expect(value, `${context} should be a JSON object`).toBeInstanceOf(Object);
  const booking = value as Record<string, unknown>;

  expect(typeof booking.firstname, `${context}.firstname should be a string`).toBe('string');
  expect((booking.firstname as string).length, `${context}.firstname should not be empty`).toBeGreaterThan(0);

  expect(typeof booking.lastname, `${context}.lastname should be a string`).toBe('string');
  expect((booking.lastname as string).length, `${context}.lastname should not be empty`).toBeGreaterThan(0);

  expect(typeof booking.totalprice, `${context}.totalprice should be a number`).toBe('number');
  expect(Number.isFinite(booking.totalprice as number), `${context}.totalprice should be finite`).toBe(true);

  expect(typeof booking.depositpaid, `${context}.depositpaid should be a boolean`).toBe('boolean');

  expect(booking.bookingdates, `${context}.bookingdates should be present`).toBeInstanceOf(Object);
  const dates = booking.bookingdates as Record<string, unknown>;
  expect(dates.checkin, `${context}.bookingdates.checkin should be an ISO date`).toMatch(ISO_DATE);
  expect(dates.checkout, `${context}.bookingdates.checkout should be an ISO date`).toMatch(ISO_DATE);

  if (booking.additionalneeds !== undefined) {
    expect(typeof booking.additionalneeds, `${context}.additionalneeds should be a string when present`).toBe('string');
  }
}

/** Assert the response body equals the booking that was submitted, field by field. */
export function expectBookingEquals(actual: unknown, expected: Booking, context = 'booking'): void {
  const booking = actual as Record<string, unknown>;
  expect(booking.firstname, `${context}.firstname should round-trip unchanged`).toBe(expected.firstname);
  expect(booking.lastname, `${context}.lastname should round-trip unchanged`).toBe(expected.lastname);
  expect(booking.totalprice, `${context}.totalprice should round-trip unchanged`).toBe(expected.totalprice);
  expect(booking.depositpaid, `${context}.depositpaid should round-trip unchanged`).toBe(expected.depositpaid);
  expect(booking.bookingdates, `${context}.bookingdates should round-trip unchanged`).toEqual(expected.bookingdates);
  if (expected.additionalneeds !== undefined) {
    expect(booking.additionalneeds, `${context}.additionalneeds should round-trip unchanged`).toBe(expected.additionalneeds);
  }
}

/**
 * Run an API call and report how long it took, in milliseconds.
 *
 * Wall-clock from the test's point of view — it includes DNS, TLS and transfer,
 * which is what a consumer of the API actually experiences, and is the number
 * worth budgeting against.
 */
export async function timed<T>(call: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = Date.now();
  const result = await call();
  return { result, ms: Date.now() - started };
}
