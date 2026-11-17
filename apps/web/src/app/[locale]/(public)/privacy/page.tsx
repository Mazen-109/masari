import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('privacy') };
}

/**
 * Privacy notice (FR-011): what is collected, why, who can see it, and how to request correction or
 * deletion. The text is a draft for the owner's and the college's review before the pilot (spec D17).
 */
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('privacy');

  return (
    <article className="max-w-[65ch]">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t('intro')}</p>

      <section aria-labelledby="privacy-collected" className="mt-10">
        <h2 id="privacy-collected" className="text-xl font-semibold">
          {t('collected.title')}
        </h2>
        <ul className="mt-3 list-disc space-y-2 ps-6">
          <li>{t('collected.account')}</li>
          <li>{t('collected.academic')}</li>
          <li>{t('collected.preferences')}</li>
          <li>{t('collected.security')}</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-purpose" className="mt-10">
        <h2 id="privacy-purpose" className="text-xl font-semibold">
          {t('purpose.title')}
        </h2>
        <p className="mt-3">{t('purpose.body')}</p>
      </section>

      <section aria-labelledby="privacy-access" className="mt-10">
        <h2 id="privacy-access" className="text-xl font-semibold">
          {t('access.title')}
        </h2>
        <ul className="mt-3 list-disc space-y-2 ps-6">
          <li>{t('access.you')}</li>
          <li>{t('access.college')}</li>
          <li>{t('access.staff')}</li>
          <li>{t('access.operators')}</li>
          <li>{t('access.providers')}</li>
        </ul>
        <p className="mt-3">{t('access.nobodyElse')}</p>
      </section>

      <section aria-labelledby="privacy-rights" className="mt-10">
        <h2 id="privacy-rights" className="text-xl font-semibold">
          {t('rights.title')}
        </h2>
        <p className="mt-3">{t('rights.correct')}</p>
        <p className="mt-3">{t('rights.delete')}</p>
      </section>
    </article>
  );
}
