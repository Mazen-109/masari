import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

type Props = Readonly<{ params: Promise<{ locale: string; rest: string[] }> }>;

// The served 404 title comes from `[locale]/not-found.tsx` (Next.js skips page metadata on a 404
// render); this one applies to client-side navigations to an unknown path.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('notFound') };
}

// Unknown paths under a valid locale render the localized `[locale]/not-found.tsx` (inside the
// locale layout) instead of the bare fallback 404. The locale is set first because paths with a dot
// (`/en/x.png`) skip the proxy and its locale header.
export default async function CatchAllPage({ params }: Props) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  notFound();
}
