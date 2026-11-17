import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

type Props = Readonly<{ params: Promise<{ locale: string; rest: string[] }> }>;

// `not-found.tsx` cannot export metadata, so the localized 404 title (`<Screen> · مساري`,
// contracts/routes.md §1) is set by this page; the layout's title template adds the app name.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('notFound') };
}

// Unknown paths under a valid locale render the localized `[locale]/not-found.tsx` (inside the
// locale layout) instead of the bare fallback 404.
export default function CatchAllPage() {
  notFound();
}
