import { test as base } from '@playwright/test';
import { BookingClient } from '../clients/booking.client';

/**
 * `booking` gives every test a ready client; `token` gives it a valid session
 * without each spec re-authenticating by hand. Both are per-test so a spec that
 * corrupts one cannot leak into another.
 */
export const test = base.extend<{ booking: BookingClient; token: string }>({
  booking: async ({ request }, use) => {
    await use(new BookingClient(request));
  },
  token: async ({ booking }, use) => {
    await use(await booking.authenticate());
  },
});

export { expect } from '@playwright/test';
