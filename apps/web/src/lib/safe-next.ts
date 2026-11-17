/**
 * The `next` parameter rule (contracts/routes.md §1): a same-site, locale-less path is honoured only if it
 * starts with a single `/`, does not start with `//` or `/\`, contains no scheme, and is at most 512
 * characters. Returns the path, or null when it must be ignored. Pure: safe in client and server code.
 *
 * Callers MUST always redirect to `'/' + locale + next` (e.g. `/ar/dashboard`), never to `next` alone:
 * the returned path is locale-less, and the locale prefix keeps the target inside the app's routes.
 */

export const MAX_NEXT_LENGTH = 512;

// Browsers drop tabs and line breaks from URLs (`/\t/evil` → `//evil`) and read `\` as `/`, so both are
// refused anywhere in the value, together with the other control characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

const PROBE_ORIGIN = 'http://masari.invalid';

export function safeNext(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (FORBIDDEN_CHARACTERS.test(value)) return null;
  // Belt and braces: resolved against any origin, the value must stay on that origin.
  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return null;
  } catch {
    return null;
  }
  return value;
}
