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
 * - Caveat: a top-level segment shaped like a language tag is treated as an unknown locale and is
 *   never locale-prefixed: 2–3 letters (`/faq`, `/map`) and also hyphenated slugs whose first part has
 *   2–3 letters and whose later parts have 2–8 letters/digits (`/my-profile`, `/in-app`, `/new-2024`).
 *   Such unprefixed paths 404 instead of redirecting to `/ar/…`; the prefixed `/ar/my-profile` is fine.
 */
export function bypassesLocaleRouting(pathname: string): boolean {
  const firstSegment = pathname.split('/')[1] ?? '';
  return LOCALE_LIKE_SEGMENT.test(firstSegment) && !isLocale(firstSegment);
}

/** The locale the language switch leads to. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

/** A locale-less app path; the leading slash is required (`profile` would give `/arprofile`). */
export type AppPath = `/${string}`;

/** The locale-less app path `href` (`/dashboard`, `/`, `/sign-in?x=1`) under `locale`. */
export function localizeHref(locale: Locale, href: AppPath): string {
  if (href === '/') return `/${locale}`;
  return href.startsWith('/?') ? `/${locale}${href.slice(1)}` : `/${locale}${href}`;
}

/** The browser pathname (`/ar/dashboard`) without its locale segment (`/dashboard`; `/` for `/ar`). */
export function localeLessPath(pathname: string): AppPath {
  const [, first = '', ...rest] = pathname.split('/');
  if (!isLocale(first)) return pathname.startsWith('/') ? (pathname as AppPath) : `/${pathname}`;
  return rest.length === 0 ? '/' : `/${rest.join('/')}`;
}

/** The same browser pathname under `target`: `/ar/dashboard` → `/en/dashboard` (language switch). */
export function switchLocalePath(pathname: string, target: Locale): string {
  return localizeHref(target, localeLessPath(pathname));
}
