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

/** The locale the language switch leads to. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}
