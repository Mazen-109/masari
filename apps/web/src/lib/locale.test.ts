import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  bypassesLocaleRouting,
  dirOf,
  isLocale,
  otherLocale,
} from '@/lib/locale';

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

describe('bypassesLocaleRouting', () => {
  it.each(['/fr', '/fr/sign-in', '/de-AT', '/zh-Hant', '/zh-Hant/x?y=1', '/eng'])(
    'passes unknown locale %s through (404 from the locale layout)',
    (pathname) => {
      expect(bypassesLocaleRouting(pathname)).toBe(true);
    },
  );

  it.each(['/', '', '/ar', '/en', '/ar/', '/en/x', '/sign-in', '/dashboard', '/invite/abc'])(
    'hands %s to next-intl',
    (pathname) => {
      expect(bypassesLocaleRouting(pathname)).toBe(false);
    },
  );

  it('treats upper-case locales as unknown (404, no case normalisation)', () => {
    expect(bypassesLocaleRouting('/AR')).toBe(true);
    expect(bypassesLocaleRouting('/En/sign-in')).toBe(true);
  });

  it('treats any 2–3-letter top-level path as an unknown locale (documented caveat)', () => {
    expect(bypassesLocaleRouting('/faq')).toBe(true);
  });
});

describe('defaults', () => {
  it('is Arabic-first', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALES[0]).toBe('ar');
  });
});
