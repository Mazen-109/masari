import type { Locale } from './locale';

/** All dates and times are shown in Egyptian time (FR-041). */
export const TIME_ZONE = 'Africa/Cairo';

// Western (Latin) digits and the Gregorian calendar in both languages (FR-041).
const INTL_LOCALE: Record<Locale, string> = {
  ar: 'ar-EG-u-nu-latn-ca-gregory',
  en: 'en-GB-u-nu-latn-ca-gregory',
};

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid date');
  }
  return date;
}

export function formatDate(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'long',
    timeZone: TIME_ZONE,
    numberingSystem: 'latn',
    calendar: 'gregory',
  }).format(toDate(value));
}

export function formatDateTime(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
    numberingSystem: 'latn',
    calendar: 'gregory',
  }).format(toDate(value));
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Omit<Intl.NumberFormatOptions, 'numberingSystem'> = {},
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    ...options,
    numberingSystem: 'latn',
  }).format(value);
}
