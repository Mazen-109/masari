import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  // The address holds the reset token: never send it to another site as a referrer.
  return { title: t('resetPassword'), referrer: 'no-referrer' };
}

/**
 * Where the reset link lands (contracts/routes.md §2, FR-010). The auth library checks the emailed token
 * and redirects here with `?token=…`, or with `?error=…` when the link is invalid, expired, or already
 * used. Without a token, or with any `error`, the page offers to request a new link; otherwise it shows the
 * new-password form. The page never checks the token itself: the action does, through the library.
 */
export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  const t = await getTranslations('auth.resetPassword');

  if (error !== undefined || typeof token !== 'string' || token === '') {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold text-balance">{t('invalidTitle')}</h1>
        <p className="mt-4 text-lg">{t('invalidBody')}</p>
        <Link href="/forgot-password" className={buttonVariants({ className: 'mt-8' })}>
          {t('requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <div className="mt-8">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
