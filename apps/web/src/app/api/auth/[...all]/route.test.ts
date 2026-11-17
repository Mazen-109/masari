import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from './route';

const handler = vi.hoisted(() => vi.fn<(request: Request) => Promise<Response>>());
const getAuth = vi.hoisted(() => vi.fn(() => ({ handler })));

vi.mock('@/server/auth/auth', () => ({ getAuth }));

const ORIGIN = 'http://localhost:3000';

afterEach(() => {
  handler.mockReset();
  getAuth.mockClear();
});

describe('/api/auth/[...all]', () => {
  it('passes an allowed GET to the auth library', async () => {
    const answer = new Response(null, { status: 302 });
    handler.mockResolvedValue(answer);
    const request = new Request(
      `${ORIGIN}/api/auth/verify-email?token=abc&callbackURL=/ar/email-verified`,
    );
    expect(await GET(request)).toBe(answer);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it.each([
    'GET /api/auth/get-session',
    'GET /api/auth/sign-up/email',
    'HEAD /api/auth/verify-email',
    'GET /api/auth/reset-password/abc/../../sign-in/email',
  ])('answers %s with an empty 404 without creating the library', async (line) => {
    const [method = 'GET', path = '/'] = line.split(' ');
    const response = await GET(new Request(`${ORIGIN}${path}`, { method }));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(getAuth).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
    ['OPTIONS', OPTIONS],
  ])('answers %s with an empty 404 without creating the library', async (_method, handle) => {
    const response = handle();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(getAuth).not.toHaveBeenCalled();
  });
});
