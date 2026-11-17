import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

// Arabic-Indic (U+0660–U+0669) and Extended Arabic-Indic (U+06F0–U+06F9) digits.
const EASTERN_DIGITS = /[٠-٩۰-۹]/;

// 2025-01-15 22:30 UTC is already 16 January 00:30 in Cairo (UTC+2 in winter).
const LATE_EVENING_UTC = new Date('2025-01-15T22:30:00Z');

describe('formatNumber', () => {
  it('uses only Western digits in Arabic', () => {
    const out = formatNumber(1234.5, 'ar');
    expect(out).not.toMatch(EASTERN_DIGITS);
    expect(out.replace(/\D/g, '')).toBe('12345');
  });

  it('formats English numbers with grouping', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('passes options through but keeps Western digits', () => {
    const out = formatNumber(0.25, 'ar', { style: 'percent' });
    expect(out).not.toMatch(EASTERN_DIGITS);
    expect(out).toContain('25');
  });
});

describe('formatDate', () => {
  it('uses Western digits, the Gregorian calendar, and Cairo time in Arabic', () => {
    const out = formatDate(LATE_EVENING_UTC, 'ar');
    expect(out).not.toMatch(EASTERN_DIGITS);
    expect(out).toContain('16');
    expect(out).toContain('2025');
    expect(out).toContain('يناير');
  });

  it('formats English dates in Cairo time', () => {
    expect(formatDate(LATE_EVENING_UTC, 'en')).toBe('16 January 2025');
  });

  it('accepts ISO strings and timestamps', () => {
    expect(formatDate('2025-01-15T22:30:00Z', 'en')).toBe('16 January 2025');
    expect(formatDate(LATE_EVENING_UTC.getTime(), 'en')).toBe('16 January 2025');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('not a date', 'ar')).toThrow(RangeError);
  });
});

describe('formatDateTime', () => {
  it('includes the Cairo time with Western digits in Arabic', () => {
    const out = formatDateTime(LATE_EVENING_UTC, 'ar');
    expect(out).not.toMatch(EASTERN_DIGITS);
    expect(out).toContain('2025');
    expect(out).toMatch(/12:30|00:30/);
  });

  it('includes the Cairo time in English', () => {
    const out = formatDateTime(LATE_EVENING_UTC, 'en');
    expect(out).toContain('16 January 2025');
    expect(out).toContain('00:30');
  });
});
