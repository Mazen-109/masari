import { expect, test } from './support/fixtures';

// contracts/http-and-env.md §1.1 (FR-045).
test('GET /api/health answers 200 {"status":"ok"} and is never cached', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers()['cache-control']).toBe('no-store');
});
