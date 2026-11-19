import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  bypassesLocaleRouting,
  dirOf,
  isLocale,
  localeLessPath,
  localizeHref,
  otherLocale,
  switchLocalePath,
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
  it('is rtl for Arabic and ltr for English', () => {
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

  it.each(['/my-profile', '/in-app', '/new-2024', '/faq-v2/x'])(
    'treats the language-tag-shaped slug %s as an unknown locale (documented caveat)',
    (pathname) => {
      expect(bypassesLocaleRouting(pathname)).toBe(true);
    },
  );

  it.each(['/sign-in', '/my-extraordinary-page', '/profile', '/ar/my-profile'])(
    'still hands %s to next-intl',
    (pathname) => {
      expect(bypassesLocaleRouting(pathname)).toBe(false);
    },
  );
});

describe('defaults', () => {
  it('is Arabic-first', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALES[0]).toBe('ar');
  });
});

describe('localizeHref', () => {
  it.each([
    ['ar', '/', '/ar'],
    ['en', '/dashboard', '/en/dashboard'],
    ['ar', '/modules/mueed', '/ar/modules/mueed'],
    ['en', '/sign-in?next=%2Fprofile', '/en/sign-in?next=%2Fprofile'],
    ['ar', '/?x=1', '/ar?x=1'],
  ] as const)('puts %s in front of %s', (locale, href, expected) => {
    expect(localizeHref(locale, href)).toBe(expected);
  });
});

describe('localeLessPath', () => {
  it.each([
    ['/ar', '/'],
    ['/en/', '/'],
    ['/ar/dashboard', '/dashboard'],
    ['/en/admin/users', '/admin/users'],
    ['/ar/unknown/deep/path', '/unknown/deep/path'],
  ])('strips the locale from %s', (pathname, expected) => {
    expect(localeLessPath(pathname)).toBe(expected);
  });

  it('leaves a path without a locale unchanged', () => {
    expect(localeLessPath('/fr/x')).toBe('/fr/x');
    expect(localeLessPath('/')).toBe('/');
  });
});

describe('switchLocalePath', () => {
  it('keeps the path and changes only the locale', () => {
    expect(switchLocalePath('/ar/dashboard', 'en')).toBe('/en/dashboard');
    expect(switchLocalePath('/en/privacy', 'ar')).toBe('/ar/privacy');
    expect(switchLocalePath('/ar', 'en')).toBe('/en');
    expect(switchLocalePath('/en/no/such/page', 'ar')).toBe('/ar/no/such/page');
  });
});
