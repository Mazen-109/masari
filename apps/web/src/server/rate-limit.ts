import { createHash } from 'node:crypto';
import { hitRateLimit } from '@masari/db';
import { fail, type ActionResult } from '@/lib/result';

/**
 * Rate-limit policy (contracts/server-actions.md §2, FR-009). Keys are `"<purpose>:<kind>:<sha256 hex>"`:
 * emails, addresses, and user ids never reach the counters table in clear text.
 */

export type RateLimitKind = 'email' | 'ip' | 'user';
export type RateLimitPolicy = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  signin: {
    email: { limit: 10, windowSeconds: 600 },
    ip: { limit: 100, windowSeconds: 600 },
  },
  register: {
    email: { limit: 3, windowSeconds: 3600 },
    ip: { limit: 60, windowSeconds: 600 },
  },
  'verify-resend': {
    email: { limit: 3, windowSeconds: 3600 },
    ip: { limit: 60, windowSeconds: 600 },
  },
  'reset-request': {
    email: { limit: 3, windowSeconds: 3600 },
    ip: { limit: 60, windowSeconds: 600 },
  },
  'invite-accept': {
    ip: { limit: 30, windowSeconds: 600 },
  },
  'invite-create': {
    user: { limit: 60, windowSeconds: 3600 },
  },
} as const satisfies Record<string, Partial<Record<RateLimitKind, RateLimitPolicy>>>;

export type RateLimitPurpose = keyof typeof RATE_LIMITS;

export type RateLimitRule = { key: string } & RateLimitPolicy;

/** Value used for the per-IP rule when the client address is unknown: one shared, strict bucket. */
export const UNKNOWN_IP = 'unknown';

/** `"<purpose>:<kind>:<sha256 hex of value>"`. Emails are hashed in their stored form (trimmed, lower-case). */
export function rateLimitKey(
  purpose: RateLimitPurpose,
  kind: RateLimitKind,
  value: string,
): string {
  const normalized = kind === 'email' ? value.trim().toLowerCase() : value;
  const digest = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `${purpose}:${kind}:${digest}`;
}

type Subjects<P extends RateLimitPurpose> = {
  [K in keyof (typeof RATE_LIMITS)[P]]: K extends 'ip' ? string | null : string;
};

/**
 * The rules of one purpose, in table order (email, then IP, then user). A null IP falls into the shared
 * `unknown` bucket, which is strict, never permissive.
 */
export function rateLimitRules<P extends RateLimitPurpose>(
  purpose: P,
  subjects: Subjects<P>,
): RateLimitRule[] {
  const policies: Partial<Record<RateLimitKind, RateLimitPolicy>> = RATE_LIMITS[purpose];
  const values = subjects as Partial<Record<RateLimitKind, string | null>>;
  const rules: RateLimitRule[] = [];
  for (const kind of ['email', 'ip', 'user'] as const) {
    const policy = policies[kind];
    if (policy === undefined) continue;
    const value = values[kind] ?? (kind === 'ip' ? UNKNOWN_IP : undefined);
    if (value === undefined || value === '') {
      throw new Error(`rateLimitRules: ${purpose} needs a ${kind} value`);
    }
    rules.push({ key: rateLimitKey(purpose, kind, value), ...policy });
  }
  return rules;
}

/**
 * Counts one hit on every rule (one after the other) and returns the first refusal as
 * `fail('rate_limited', { retryAfterSeconds })`, or null when every rule allows the request.
 */
export async function enforceRateLimit(
  rules: readonly RateLimitRule[],
): Promise<ActionResult<never> | null> {
  let refusal: ActionResult<never> | null = null;
  for (const { key, limit, windowSeconds } of rules) {
    const result = await hitRateLimit(key, { limit, windowSeconds });
    if (!result.allowed && refusal === null) {
      refusal = fail('rate_limited', { retryAfterSeconds: result.retryAfterSeconds });
    }
  }
  return refusal;
}
