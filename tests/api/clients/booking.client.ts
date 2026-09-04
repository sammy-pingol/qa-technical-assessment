import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface BookingDates {
  checkin: string;
  checkout: string;
}

export interface Booking {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: BookingDates;
  additionalneeds?: string;
}

export interface CreatedBooking {
  bookingid: number;
  booking: Booking;
}

/**
 * Thin wrapper over the restful-booker Booking API.
 *
 * It deliberately does NOT assert anything and never throws on a non-2xx: the
 * specs own the assertions, including the negative ones that expect 4xx/5xx.
 * The client's only job is to make each call correct and readable.
 *
 * Auth note: restful-booker accepts the session token either as a `Cookie:
 * token=<t>` header or via `Authorization: Basic`. The cookie form is used here
 * because it is what the published API docs demonstrate.
 */
export class BookingClient {
  constructor(private readonly request: APIRequestContext) {}

  /** POST /auth — returns the raw response so negative tests can inspect it. */
  createTokenResponse(username: string, password: string): Promise<APIResponse> {
    return this.request.post('/auth', { data: { username, password } });
  }

  /** POST /auth — convenience path for tests that just need a working token. */
  async authenticate(
    username = process.env.API_USERNAME ?? 'admin',
    password = process.env.API_PASSWORD ?? 'password123',
  ): Promise<string> {
    const response = await this.createTokenResponse(username, password);
    const body = (await response.json()) as { token?: string; reason?: string };
    if (typeof body.token !== 'string') {
      throw new Error(`Could not obtain an auth token: ${JSON.stringify(body)}`);
    }
    return body.token;
  }

  /** POST /booking */
  create(payload: unknown): Promise<APIResponse> {
    return this.request.post('/booking', { data: payload });
  }

  /** GET /booking/{id} */
  getById(bookingId: number | string): Promise<APIResponse> {
    return this.request.get(`/booking/${bookingId}`);
  }

  /** GET /booking — the id index, optionally filtered. */
  list(filters?: Record<string, string>): Promise<APIResponse> {
    return this.request.get('/booking', { params: filters });
  }

  /** PUT /booking/{id} — full replacement. Omit the token to test auth. */
  update(bookingId: number | string, payload: unknown, token?: string): Promise<APIResponse> {
    return this.request.put(`/booking/${bookingId}`, {
      data: payload,
      headers: this.authHeaders(token),
    });
  }

  /** PATCH /booking/{id} — partial update. */
  partialUpdate(bookingId: number | string, payload: unknown, token?: string): Promise<APIResponse> {
    return this.request.patch(`/booking/${bookingId}`, {
      data: payload,
      headers: this.authHeaders(token),
    });
  }

  /** DELETE /booking/{id} */
  remove(bookingId: number | string, token?: string): Promise<APIResponse> {
    return this.request.delete(`/booking/${bookingId}`, { headers: this.authHeaders(token) });
  }

  /** Create a booking and return its id — a precondition helper, not a test. */
  async seedBooking(payload: Booking): Promise<CreatedBooking> {
    const response = await this.create(payload);
    if (response.status() !== 200) {
      throw new Error(`Test setup failed: could not seed a booking (HTTP ${response.status()}).`);
    }
    return (await response.json()) as CreatedBooking;
  }

  private authHeaders(token?: string): Record<string, string> {
    return token === undefined ? {} : { Cookie: `token=${token}` };
  }
}
