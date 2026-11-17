/**
 * The `next` parameter rule (contracts/routes.md §1): a same-site, locale-less path is honoured only if it
 * starts with a single `/`, does not start with `//` or `/\`, contains no scheme, and is at most 512
 * characters. Returns the path, or null when it must be ignored. Pure: safe in client and server code.
 *
 * Callers MUST always redirect to `'/' + locale + next` (e.g. `/ar/dashboard`), never to `next` alone:
 * the returned path is locale-less, and the locale prefix keeps the target inside the app's routes.
 */

import { LOCALES } from '@/lib/locale';

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

// A leading locale segment (`/ar`, `/en`, followed by `/`, `?`, `#`, or the end).
const LOCALE_PREFIX = new RegExp(`^/(?:${LOCALES.join('|')})(?=[/?#]|$)`);

/**
 * `safeNext`, then without a leading locale segment: callers prefix the user's own locale, so
 * `next=/en/dashboard` must become `/dashboard`, never `/ar/en/dashboard`. A value that is only a locale
 * (`/en`, `/en?x=1`) or that is unsafe once stripped (`/en//evil`) gives null.
 */
export function localeLessNext(value: unknown): string | null {
  const next = safeNext(value);
  if (next === null) return null;
  const stripped = next.replace(LOCALE_PREFIX, '');
  if (stripped === next) return next;
  return stripped.startsWith('/') ? safeNext(stripped) : null;
}
