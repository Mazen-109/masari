export const LOCALES = ['ar', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export type Direction = 'rtl' | 'ltr';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

// A path segment shaped like a language tag: `fr`, `de-AT`, `zh-Hant` (any letter case).
const LOCALE_LIKE_SEGMENT = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

/**
 * True when `proxy.ts` must pass the request through untouched instead of handing it to next-intl:
 * the first path segment looks like a language tag but is not one of our locales. `[locale]/layout.tsx`
 * then answers 404 directly (contracts/routes.md §1), where next-intl would redirect `/fr` → `/ar/fr`.
 *
 * - Matching is exact and case-sensitive on the locale, so `/AR` and `/En/x` are 404s (no case
 *   normalisation to `/ar`); this is intended.
 * - Caveat: every top-level path of 2–3 letters (e.g. `/faq`, `/map`) is treated as an unknown
 *   locale and is never locale-prefixed, so such paths must not be used for screens; `/ar/faq` is fine.
 */
export function bypassesLocaleRouting(pathname: string): boolean {
  const firstSegment = pathname.split('/')[1] ?? '';
  return LOCALE_LIKE_SEGMENT.test(firstSegment) && !isLocale(firstSegment);
}

/** The locale the language switch leads to. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}
