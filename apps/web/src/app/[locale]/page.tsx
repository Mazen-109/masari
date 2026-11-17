import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { routing } from '@/i18n/routing';

// Temporary home page (PR-7). PR-18 turns `/` into the signed-in/signed-out redirect.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main id="main">
      <h1>{t('appName')}</h1>
      <LocaleSwitcher />
    </main>
  );
}
