import { describe, expect, it } from 'vitest';
import { fail, ok, type ActionResult } from '@/lib/result';

describe('ok', () => {
  it('wraps data in a success result', () => {
    expect(ok({ id: 'a' })).toEqual({ ok: true, data: { id: 'a' } });
  });

  it('accepts undefined for actions without data', () => {
    expect(ok(undefined)).toEqual({ ok: true, data: undefined });
  });
});

describe('fail', () => {
  it('returns only ok and code when no extra is given', () => {
    expect(fail('forbidden')).toStrictEqual({ ok: false, code: 'forbidden' });
  });

  it('carries field errors for validation failures', () => {
    expect(fail('validation', { fieldErrors: { email: 'invalid_email' } })).toStrictEqual({
      ok: false,
      code: 'validation',
      fieldErrors: { email: 'invalid_email' },
    });
  });

  it('carries retryAfterSeconds and meta', () => {
    expect(fail('rate_limited', { retryAfterSeconds: 60, meta: { limit: 3 } })).toStrictEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 60,
      meta: { limit: 3 },
    });
  });

  it('omits extra fields that are undefined', () => {
    expect(fail('internal', {})).toStrictEqual({ ok: false, code: 'internal' });
  });

  it('is assignable to any ActionResult type', () => {
    const result: ActionResult<{ id: string }> = fail('not_found');
    expect(result.ok).toBe(false);
  });
});
