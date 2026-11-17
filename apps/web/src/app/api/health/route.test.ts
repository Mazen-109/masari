import { afterEach, describe, expect, it, vi } from 'vitest';
import { dynamic, GET } from './route';

const ping = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('@masari/db', () => ({ ping }));

afterEach(() => {
  vi.restoreAllMocks();
  ping.mockReset();
});

describe('GET /api/health', () => {
  it('is never prerendered or cached', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('returns 200 {"status":"ok"} with Cache-Control: no-store when the database answers', async () => {
    ping.mockResolvedValue(undefined);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it('returns 503 {"status":"unavailable"} without details when the database is unreachable', async () => {
    ping.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('ECONNREFUSED');
  });
});
