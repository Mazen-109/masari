import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { ClientMessages } from '@/i18n/client-messages';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('forgotPassword') };
}

/**
 * "Forgot your password?" (contracts/routes.md §2, FR-010): request a reset link. The same confirmation is
 * shown for every address (FR-005). Signed-in users go to their dashboard.
 */
export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Rendered per request (session); never prerendered at build time, where no environment exists.
  await connection();
  if ((await getSessionContext()) !== null) {
    redirect(`/${locale}/dashboard`);
  }
  const t = await getTranslations('auth.forgotPassword');

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <div className="mt-8">
        <ClientMessages forms namespaces={['auth.forgotPassword']}>
          <ForgotPasswordForm />
        </ClientMessages>
      </div>
      <p className="mt-10 border-t border-border pt-6">
        <Link href="/sign-in" className="font-medium text-primary underline underline-offset-4">
          {t('backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
