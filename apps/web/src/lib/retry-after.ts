/**
 * Whole minutes to show for a `rate_limited` failure's `retryAfterSeconds` (contracts/server-actions.md §2):
 * rounded up so the user never retries too early, and at least 1. Null when the value is missing or not a
 * positive finite number (the message then shows no time).
 */
export function retryAfterMinutes(retryAfterSeconds: number | undefined): number | null {
  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds)) return null;
  if (retryAfterSeconds <= 0) return null;
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}
