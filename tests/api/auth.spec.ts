import { test, expect } from './fixtures/api.fixture';
import { flagDefect } from './support/assertions';

/**
 * POST /auth is a precondition for UpdateBooking and DeleteBooking, so it is
 * covered in its own right rather than assumed to work.
 */
test.describe('Auth — POST /auth', () => {
  test('TC-A-001 (P) valid credentials return a session token', async ({ booking }) => {
    const response = await booking.createTokenResponse('admin', 'password123');

    expect(response.status(), 'valid credentials should be accepted').toBe(200);
    expect(response.headers()['content-type'], 'the token response should be JSON').toContain('application/json');

    const body = (await response.json()) as { token?: string };
    expect(typeof body.token, 'a token string should be issued').toBe('string');
    expect(body.token!.length, 'the token should not be empty').toBeGreaterThan(0);
  });

  test('TC-A-002 (N) invalid credentials do not return a token', async ({ booking }) => {
    const response = await booking.createTokenResponse('admin', 'definitely-the-wrong-password');
    const body = (await response.json()) as { token?: string; reason?: string };

    // The security-relevant assertion: no token is issued.
    expect(body.token, 'no token should be issued for bad credentials').toBeUndefined();
    expect(body.reason, 'a failure reason should be returned').toBe('Bad credentials');

    flagDefect(
      'DEFECT-009',
      'POST /auth returns HTTP 200 for a failed authentication instead of 401 Unauthorized. '
      + 'Clients cannot rely on the status code to detect auth failure and must parse the body.',
    );
    expect(response.status(), 'documenting the actual (non-standard) status — see DEFECT-009').toBe(200);
  });

  test('TC-A-003 (N) an empty credential payload does not return a token', async ({ booking }) => {
    const response = await booking.createTokenResponse('', '');
    const body = (await response.json()) as { token?: string };

    expect(body.token, 'no token should be issued for empty credentials').toBeUndefined();
  });
});
