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
  return { title: t('verifyEmail') };
}

/**
 * "Check your email" (contracts/routes.md §2): shown after every registration attempt, whether or not the
 * address already had an account (FR-005). The resend form is added in PR-17.
 */
export default async function VerifyEmailPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('auth.verifyEmail');

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-4 text-lg">{t('body')}</p>
      <p className="mt-3 text-muted-foreground">{t('spam')}</p>
    </div>
  );
}
