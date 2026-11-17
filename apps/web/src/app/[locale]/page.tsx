import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PublicHeader } from '@/components/shell/public-header';
import { SkipLink } from '@/components/shell/skip-link';
import { routing } from '@/i18n/routing';

// Temporary home page (PR-7, styled in PR-8). PR-18 turns `/` into the signed-in/signed-out redirect.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <>
      <SkipLink />
      <PublicHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24"
      >
        <h1 className="max-w-[22ch] text-3xl font-bold text-balance sm:text-4xl">{t('title')}</h1>
        <p className="mt-4 max-w-[60ch] text-lg text-muted-foreground">{t('lead')}</p>
      </main>
    </>
  );
}
