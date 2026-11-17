import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { FALLBACK_NOT_FOUND_TITLE } from '@/lib/fallback-text';

// On a 404 render Next.js takes the title from the layouts plus the deepest `not-found` file of the
// matched tree, not from the page that called `notFound()` — so the localized 404 title
// (`<Screen> · مساري`, contracts/routes.md §1) is set here. For an unknown locale (`/fr`) this file
// still shadows `app/not-found.tsx` metadata, so it returns the bilingual fallback title.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return { title: { absolute: FALLBACK_NOT_FOUND_TITLE } };
  }
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('notFound') };
}

// Localized 404 for unknown paths under a valid locale (contracts/routes.md §5).
export default async function LocaleNotFound() {
  const t = await getTranslations('common');

  return (
    <main id="main">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <Link href="/">{t('actions.goHome')}</Link>
      </p>
      <LocaleSwitcher />
    </main>
  );
}
