import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
  rateLimitRules,
  type RateLimitRule,
} from './rate-limit';

const hitRateLimit = vi.hoisted(() =>
  vi.fn<
    (
      key: string,
      opts: { limit: number; windowSeconds: number },
    ) => Promise<{ allowed: boolean; retryAfterSeconds: number }>
  >(),
);

vi.mock('@masari/db', () => ({ hitRateLimit }));

afterEach(() => {
  hitRateLimit.mockReset();
});

const EMAIL = 'Student.One@Example.edu';
const IP = '203.0.113.5';
const USER_ID = 'user'.repeat(4);
const SHA256_HEX = /^[0-9a-f]{64}$/;

describe('RATE_LIMITS', () => {
  // Every number of contracts/server-actions.md §2 (FR-009), written out by hand.
  it('pins the policy table', () => {
    expect(RATE_LIMITS).toEqual({
      signin: { email: { limit: 10, windowSeconds: 600 }, ip: { limit: 100, windowSeconds: 600 } },
      register: { email: { limit: 3, windowSeconds: 3600 }, ip: { limit: 60, windowSeconds: 600 } },
      'verify-resend': {
        email: { limit: 3, windowSeconds: 3600 },
        ip: { limit: 60, windowSeconds: 600 },
      },
      'reset-request': {
        email: { limit: 3, windowSeconds: 3600 },
        ip: { limit: 60, windowSeconds: 600 },
      },
      'invite-accept': { ip: { limit: 30, windowSeconds: 600 } },
      'invite-create': { user: { limit: 60, windowSeconds: 3600 } },
    });
  });
});

describe('rateLimitKey', () => {
  it('is "<purpose>:<kind>:<sha256 hex>" and contains no raw value', () => {
    for (const [kind, value] of [
      ['email', EMAIL],
      ['ip', IP],
      ['user', USER_ID],
    ] as const) {
      const key = rateLimitKey('signin', kind, value);
      const [purpose, keyKind, digest, ...rest] = key.split(':');
      expect(purpose).toBe('signin');
      expect(keyKind).toBe(kind);
      expect(digest).toMatch(SHA256_HEX);
      expect(rest).toEqual([]);
      expect(key.toLowerCase()).not.toContain(value.toLowerCase());
    }
    expect(rateLimitKey('signin', 'email', EMAIL)).not.toContain('example');
  });

  it('hashes emails in their stored form (trimmed, lower-case)', () => {
    expect(rateLimitKey('register', 'email', `  ${EMAIL} `)).toBe(
      rateLimitKey('register', 'email', 'student.one@example.edu'),
    );
  });

  it('separates purposes and values', () => {
    expect(rateLimitKey('signin', 'ip', IP)).not.toBe(rateLimitKey('register', 'ip', IP));
    expect(rateLimitKey('signin', 'ip', IP)).not.toBe(rateLimitKey('signin', 'ip', '203.0.113.6'));
  });

  it('stays far below the 200-character key limit for the longest purpose', () => {
    expect(rateLimitKey('verify-resend', 'email', 'x'.repeat(254)).length).toBeLessThanOrEqual(200);
  });
});

describe('rateLimitRules', () => {
  it('builds the per-email and per-IP rules of a purpose', () => {
    expect(rateLimitRules('signin', { email: EMAIL, ip: IP })).toEqual([
      { key: rateLimitKey('signin', 'email', EMAIL), limit: 10, windowSeconds: 600 },
      { key: rateLimitKey('signin', 'ip', IP), limit: 100, windowSeconds: 600 },
    ]);
  });

  it('applies the per-IP rule on the shared "unknown" value when the address is null', () => {
    expect(rateLimitRules('invite-accept', { ip: null })).toEqual([
      { key: rateLimitKey('invite-accept', 'ip', 'unknown'), limit: 30, windowSeconds: 600 },
    ]);
  });

  it('limits invitation creation per acting user', () => {
    expect(rateLimitRules('invite-create', { user: USER_ID })).toEqual([
      { key: rateLimitKey('invite-create', 'user', USER_ID), limit: 60, windowSeconds: 3600 },
    ]);
  });

  it('refuses to build a rule without its value', () => {
    expect(() => rateLimitRules('register', { email: '', ip: IP })).toThrow(/needs a email value/);
  });
});

describe('enforceRateLimit', () => {
  const rules: RateLimitRule[] = [
    { key: 'signin:email:a', limit: 10, windowSeconds: 600 },
    { key: 'signin:ip:b', limit: 100, windowSeconds: 600 },
  ];

  it('returns null when every rule allows the request, after counting a hit on each', async () => {
    hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    await expect(enforceRateLimit(rules)).resolves.toBeNull();
    expect(hitRateLimit.mock.calls).toEqual([
      ['signin:email:a', { limit: 10, windowSeconds: 600 }],
      ['signin:ip:b', { limit: 100, windowSeconds: 600 }],
    ]);
  });

  it('returns the first refusal as rate_limited with retryAfterSeconds', async () => {
    hitRateLimit
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 7 });
    await expect(enforceRateLimit(rules)).resolves.toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 42,
    });
    expect(hitRateLimit).toHaveBeenCalledTimes(2);
  });

  it('refuses when only a later rule is exceeded', async () => {
    hitRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });
    await expect(enforceRateLimit(rules)).resolves.toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 300,
    });
  });
});
