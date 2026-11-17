import { expect, test } from './support/fixtures';

// contracts/http-and-env.md §1.2 (FR-013): the auth library's own endpoints are closed. Account operations
// exist only as Masari Server Actions; the handler serves nothing but the email link targets.

const CLOSED: ReadonlyArray<{
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, string>;
}> = [
  {
    method: 'POST',
    path: '/api/auth/sign-up/email',
    body: {
      name: 'Closed Endpoint',
      email: 'closed-endpoint@example.test',
      password: 'not-a-real-pass-1',
    },
  },
  {
    method: 'POST',
    path: '/api/auth/sign-in/email',
    body: { email: 'closed-endpoint@example.test', password: 'not-a-real-pass-1' },
  },
  { method: 'GET', path: '/api/auth/get-session' },
];

for (const { method, path, body } of CLOSED) {
  test(`${method} ${path} answers 404 with an empty body`, async ({ request }) => {
    const response = await request.fetch(path, {
      method,
      ...(body ? { data: body } : {}),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(await response.body()).toHaveLength(0);
    expect(response.headers()['set-cookie']).toBeUndefined();
  });
}

// Smoke test of the live auth instance (environment, Drizzle adapter, table mapping, grants): an unknown
// reset token is looked up in `verifications` and redirected back with the library's error code.
test('GET /api/auth/reset-password/<unknown token> redirects with error=INVALID_TOKEN', async ({
  request,
  baseURL,
}) => {
  // A made-up 24-character token built from a pattern (same shape as the library's generateId(24)).
  const token = 'Zx7'.repeat(8);
  const response = await request.get(
    `/api/auth/reset-password/${token}?callbackURL=/ar/reset-password`,
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(302);
  const location = new URL(response.headers()['location'] ?? '', baseURL);
  expect(location.origin).toBe(new URL(baseURL ?? '').origin);
  expect(location.pathname).toBe('/ar/reset-password');
  expect(location.searchParams.get('error')).toBe('INVALID_TOKEN');
  expect(location.searchParams.has('token')).toBe(false);
});
