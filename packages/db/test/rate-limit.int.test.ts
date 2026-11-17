import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  hitRateLimit,
  MAX_KEY_LENGTH,
  MAX_LIMIT,
  MAX_WINDOW_SECONDS,
  purgeExpiredRateLimits,
} from '../src/rate-limit';
import { closeTestPools, ownerQuery, runtimeQuery } from './helpers';

// contracts/db-api.md §4: counts, refuses over the limit with a positive retryAfterSeconds, resets after the
// window (window passed as 1 s), concurrent hits are atomic; purgeExpiredRateLimits removes only counters
// older than the given age. hitRateLimit and purge run as the runtime role. Window expiry is simulated by
// back-dating window_start, never by sleeping (tests must not depend on wall-clock timing).

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(closeTestPools);

function randomKey(purpose = 'test'): string {
  return `${purpose}:${randomBytes(16).toString('hex')}`;
}

async function storedCount(key: string): Promise<number | undefined> {
  const result = await runtimeQuery<{ count: number }>(
    'SELECT count FROM rate_limit_counters WHERE key = $1',
    [key],
  );
  return result.rows[0]?.count;
}

/** Moves the key's window start into the past (as the owner); asserts that exactly one row moved. */
async function backdate(key: string, seconds: number): Promise<void> {
  const result = await ownerQuery(
    `UPDATE rate_limit_counters SET window_start = now() - $2::int * interval '1 second' WHERE key = $1`,
    [key, seconds],
  );
  expect(result.rowCount).toBe(1);
}

async function insertCounter(key: string, ageSeconds: number): Promise<void> {
  await ownerQuery(
    `INSERT INTO rate_limit_counters (key, window_start, count)
     VALUES ($1, now() - $2::int * interval '1 second', 1)`,
    [key, ageSeconds],
  );
}

async function existingKeys(keys: string[]): Promise<string[]> {
  const result = await runtimeQuery<{ key: string }>(
    'SELECT key FROM rate_limit_counters WHERE key = ANY ($1::text[]) ORDER BY key',
    [keys],
  );
  return result.rows.map((row) => row.key);
}

describe('hitRateLimit', () => {
  it('allows hits up to the limit and refuses the next one with a positive retryAfterSeconds', async () => {
    const key = randomKey();
    const opts = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await hitRateLimit(key, opts));
    expect(results.slice(0, 3)).toEqual([
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: true, retryAfterSeconds: 0 },
    ]);
    const refused = results[3];
    expect(refused?.allowed).toBe(false);
    expect(refused?.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused?.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(await storedCount(key)).toBe(4);
  });

  it('counts keys independently', async () => {
    const first = randomKey();
    const second = randomKey();
    expect((await hitRateLimit(first, { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
    expect((await hitRateLimit(first, { limit: 1, windowSeconds: 60 })).allowed).toBe(false);
    expect((await hitRateLimit(second, { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it('allows exactly `limit` of 20 concurrent hits', async () => {
    const key = randomKey();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => hitRateLimit(key, { limit: 10, windowSeconds: 60 })),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    for (const result of results.filter((item) => !item.allowed)) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    // The stored count stops at limit + 1, so a long flood cannot overflow it.
    expect(await storedCount(key)).toBe(11);
  });

  it('starts a new window once the old one has ended (1 s window)', async () => {
    const key = randomKey();
    const opts = { limit: 1, windowSeconds: 1 };
    expect(await hitRateLimit(key, opts)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    await backdate(key, 1);
    // Limit 1: allowed only because the window was reset (an increment would make it 2 and refuse it).
    expect(await hitRateLimit(key, opts)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(await storedCount(key)).toBe(1);
  });

  it('keeps counting while the window is still open', async () => {
    const key = randomKey();
    const opts = { limit: 1, windowSeconds: 3600 };
    await hitRateLimit(key, opts);
    await backdate(key, 1800);
    const refused = await hitRateLimit(key, opts);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(1700);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(1800);
  });

  it('rejects keys longer than 200 characters and empty keys before touching the table', async () => {
    const tooLong = `test:${'a'.repeat(MAX_KEY_LENGTH)}`;
    await expect(hitRateLimit(tooLong, { limit: 1, windowSeconds: 60 })).rejects.toThrow(
      'key must be 1–200 characters',
    );
    await expect(hitRateLimit('', { limit: 1, windowSeconds: 60 })).rejects.toThrow('key must be');
    expect(await existingKeys([tooLong])).toEqual([]);
  });

  it('accepts a key of exactly 200 characters', async () => {
    const key = `test:${randomBytes(98).toString('hex')}`.slice(0, MAX_KEY_LENGTH);
    expect(key).toHaveLength(MAX_KEY_LENGTH);
    expect((await hitRateLimit(key, { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it('rejects a limit or window that is not a positive integer', async () => {
    const key = randomKey();
    await expect(hitRateLimit(key, { limit: 0, windowSeconds: 60 })).rejects.toThrow('limit');
    await expect(hitRateLimit(key, { limit: 1.5, windowSeconds: 60 })).rejects.toThrow('limit');
    await expect(hitRateLimit(key, { limit: 1, windowSeconds: 0 })).rejects.toThrow(
      'windowSeconds',
    );
    expect(await existingKeys([key])).toEqual([]);
  });

  it('rejects a limit above 1,000,000 or a window above one day, accepting both maxima', async () => {
    expect(MAX_LIMIT).toBe(1_000_000);
    expect(MAX_WINDOW_SECONDS).toBe(86_400);
    const key = randomKey();
    await expect(hitRateLimit(key, { limit: MAX_LIMIT + 1, windowSeconds: 60 })).rejects.toThrow(
      'limit must be an integer from 1 to 1000000',
    );
    await expect(
      hitRateLimit(key, { limit: 1, windowSeconds: MAX_WINDOW_SECONDS + 1 }),
    ).rejects.toThrow('windowSeconds must be an integer from 1 to 86400');
    expect(await existingKeys([key])).toEqual([]);

    expect(
      await hitRateLimit(key, { limit: MAX_LIMIT, windowSeconds: MAX_WINDOW_SECONDS }),
    ).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('purges expired counters on a sampled call and not otherwise', async () => {
    const old = randomKey('old');
    await insertCounter(old, 2 * 86_400);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await hitRateLimit(randomKey(), { limit: 1, windowSeconds: 60 });
    expect(await existingKeys([old])).toEqual([old]);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    await hitRateLimit(randomKey(), { limit: 1, windowSeconds: 60 });
    expect(await existingKeys([old])).toEqual([]);
  });
});

describe('purgeExpiredRateLimits', () => {
  it('removes only counters older than the given age', async () => {
    const twoDays = randomKey('purge');
    const twoHours = randomKey('purge');
    const fresh = randomKey('purge');
    await insertCounter(twoDays, 2 * 86_400);
    await insertCounter(twoHours, 2 * 3600);
    await insertCounter(fresh, 0);
    const all = [twoDays, twoHours, fresh];

    expect(await purgeExpiredRateLimits()).toBeGreaterThanOrEqual(1);
    expect(await existingKeys(all)).toEqual([twoHours, fresh].sort());

    expect(await purgeExpiredRateLimits(3600)).toBeGreaterThanOrEqual(1);
    expect(await existingKeys(all)).toEqual([fresh]);
  });

  it('rejects a negative or fractional age', async () => {
    await expect(purgeExpiredRateLimits(-1)).rejects.toThrow('olderThanSeconds');
    await expect(purgeExpiredRateLimits(0.5)).rejects.toThrow('olderThanSeconds');
  });
});
