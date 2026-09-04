import type { Booking } from '../clients/booking.client';

/**
 * Test data is generated, never hard-coded, so parallel workers cannot collide
 * on a shared record and a rerun never depends on the previous run's state.
 */
let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now().toString(36)}${sequence}`;
}

/** ISO date `days` from today — keeps fixtures from expiring over time. */
export function isoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A valid booking. Override any field to build a targeted variant. */
export function aBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    firstname: `Test${uniqueSuffix()}`,
    lastname: `Candidate${uniqueSuffix()}`,
    totalprice: 350,
    depositpaid: true,
    bookingdates: {
      checkin: isoDate(14),
      checkout: isoDate(21),
    },
    additionalneeds: 'Breakfast',
    ...overrides,
  };
}
