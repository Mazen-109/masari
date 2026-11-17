import { getPool } from './client';

/**
 * Fixed-window rate limiter on `rate_limit_counters` (contracts/db-api.md §1.4, data-model.md §3.4).
 * One atomic statement per hit: concurrent hits on the same key serialise on the row, so exactly `limit`
 * of them are allowed per window. Keys carry a purpose prefix and a hash — never raw emails or addresses.
 */

export interface RateLimitOptions {
  /** Hits allowed per window (integer 1–MAX_LIMIT). A key must always be hit with the same limit. */
  limit: number;
  /** Window length in seconds (integer 1–MAX_WINDOW_SECONDS). */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends; 0 when allowed. */
  retryAfterSeconds: number;
}

export const MAX_KEY_LENGTH = 200;
/** Far above any policy; keeps limit + 1 and the window arithmetic well inside PostgreSQL's int range. */
export const MAX_LIMIT = 1_000_000;
/** One day: the purge removes counters older than that, so a longer window would be reset early. */
export const MAX_WINDOW_SECONDS = 86_400;
const DEFAULT_PURGE_AGE_SECONDS = 86_400;
const PURGE_PROBABILITY = 0.01;

// The stored count is capped at limit + 1: enough to know the limit is exceeded, and it can never overflow
// however long a flood lasts. The cap uses the limit of the current call, so a key must always be used with
// the same limit (one policy per key prefix). now() is the statement's start time, used consistently for
// the reset decision and for retryAfterSeconds.
const HIT_SQL = `
  INSERT INTO rate_limit_counters AS r (key, window_start, count)
  VALUES ($1, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN r.window_start + $2::int * interval '1 second' <= now()
                        THEN now() ELSE r.window_start END,
    count = CASE WHEN r.window_start + $2::int * interval '1 second' <= now()
                 THEN 1 ELSE least(r.count + 1, $3::int + 1) END
  RETURNING count,
            greatest(1, ceil(extract(epoch FROM r.window_start + $2::int * interval '1 second' - now())))::int
              AS seconds_left`;

function assertIntegerInRange(value: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`hitRateLimit: ${name} must be an integer from 1 to ${max}`);
  }
}

/** Counts one hit for key and says whether it is within the limit of the current window. */
export async function hitRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  // Code points, like PostgreSQL's char_length in the column CHECK.
  const length = [...key].length;
  if (length === 0 || length > MAX_KEY_LENGTH) {
    throw new Error(`hitRateLimit: key must be 1–${MAX_KEY_LENGTH} characters`);
  }
  assertIntegerInRange(opts.limit, MAX_LIMIT, 'limit');
  assertIntegerInRange(opts.windowSeconds, MAX_WINDOW_SECONDS, 'windowSeconds');

  const { rows } = await getPool().query<{ count: number; seconds_left: number }>(HIT_SQL, [
    key,
    opts.windowSeconds,
    opts.limit,
  ]);
  const row = rows[0];
  if (!row) throw new Error('hitRateLimit: no row returned');

  if (Math.random() < PURGE_PROBABILITY) {
    // Best effort: the table stays bounded without a scheduler; a failed purge must not fail the hit.
    await purgeExpiredRateLimits().catch(() => undefined);
  }

  const allowed = row.count <= opts.limit;
  return { allowed, retryAfterSeconds: allowed ? 0 : row.seconds_left };
}

/** Deletes counters whose window started more than olderThanSeconds ago; returns how many were removed. */
export async function purgeExpiredRateLimits(
  olderThanSeconds: number = DEFAULT_PURGE_AGE_SECONDS,
): Promise<number> {
  if (!Number.isSafeInteger(olderThanSeconds) || olderThanSeconds < 0) {
    throw new Error('purgeExpiredRateLimits: olderThanSeconds must be a non-negative integer');
  }
  const result = await getPool().query(
    `DELETE FROM rate_limit_counters WHERE window_start < now() - $1::int * interval '1 second'`,
    [olderThanSeconds],
  );
  return result.rowCount ?? 0;
}
