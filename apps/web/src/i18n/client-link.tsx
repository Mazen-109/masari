'use client';

import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import { DEFAULT_LOCALE, isLocale, localizeHref, type AppPath } from '@/lib/locale';

type ClientLinkProps = Omit<ComponentProps<typeof NextLink>, 'href' | 'locale'> & {
  /** Locale-less app path, e.g. `/dashboard` or `/profile`. */
  href: AppPath;
};

/**
 * `next/link` with the current locale in front, for **client components** (server components use `Link`
 * from navigation.tsx). The locale comes from the route parameter, so it needs no message provider. The
 * bundler includes `next/link` in the chunk of every client component that imports this, so screens
 * that must stay light keep their links in server components (PR-40).
 */
export function ClientLink({ href, ...props }: ClientLinkProps) {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  return <NextLink href={localizeHref(locale, href)} {...props} />;
}
