import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import type { ComponentProps } from 'react';
import { DEFAULT_LOCALE, isLocale, localizeHref, type AppPath } from '@/lib/locale';

type LinkProps = Omit<ComponentProps<typeof NextLink>, 'href' | 'locale'> & {
  /** Locale-less app path, e.g. `/dashboard` or `/sign-in?next=%2Fprofile`. */
  href: AppPath;
};

/**
 * `next/link` with the current locale in front (contracts/routes.md §1: every path carries the locale),
 * for **server components**; client components use `ClientLink` (client-link.tsx).
 *
 * It replaces next-intl's `createNavigation` Link (PR-40, research.md §17). That one is a client
 * component, and the bundler copied it — with its own copy of `next/link` — into the script of every
 * layout, page, and boundary that rendered a link. Rendered here, on the server, the browser gets only
 * `next/link` itself, one shared chunk for the whole page. navigation.test.ts fails when a `'use client'`
 * module imports it (the project has no `server-only` package).
 */
export function Link({ href, ...props }: LinkProps) {
  const locale = useLocale();
  return (
    <NextLink href={localizeHref(isLocale(locale) ? locale : DEFAULT_LOCALE, href)} {...props} />
  );
}
