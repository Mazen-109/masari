import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locale';

// contracts/routes.md §1: every path carries the locale; the bare `/` always goes to `/ar`
// whatever the browser language (Arabic-first, research.md §12). No locale cookie is set.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: false,
  // The site is noindex; no hreflang `Link` response header.
  alternateLinks: false,
});
