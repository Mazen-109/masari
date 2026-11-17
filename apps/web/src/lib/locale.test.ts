import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, dirOf, isLocale, otherLocale } from '@/lib/locale';

describe('isLocale', () => {
  it('accepts the supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['fr', 'AR', 'ar-EG', '', undefined, null, 1, {}]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe('dirOf', () => {
  it('is right-to-left for Arabic and left-to-right for English', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
});

describe('otherLocale', () => {
  it('switches between the two locales', () => {
    expect(otherLocale('ar')).toBe('en');
    expect(otherLocale('en')).toBe('ar');
  });
});

describe('defaults', () => {
  it('is Arabic-first', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALES[0]).toBe('ar');
  });
});
