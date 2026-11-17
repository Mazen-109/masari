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
