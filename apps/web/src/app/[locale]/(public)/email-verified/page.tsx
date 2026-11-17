import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { ResendVerificationForm } from '@/features/auth/components/resend-verification-form';
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
  return { title: t('emailVerified') };
}

/**
 * Where the confirmation link lands (contracts/routes.md §2, FR-004). The auth library redirects here
 * after checking the token: without `error` the address is confirmed (also when the same link is opened
 * again); with any `error` (invalid, expired, unknown account) the link did not work and a new one can be
 * requested. The page only shows the outcome: it never signs the user in.
 */
export default async function EmailVerifiedPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations('auth.emailVerified');

  if (error !== undefined) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold text-balance">{t('errorTitle')}</h1>
        <p className="mt-4 text-lg">{t('errorBody')}</p>
        <div className="mt-10 border-t border-border pt-8">
          <ResendVerificationForm variant="invalid" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('successTitle')}</h1>
      <p className="mt-4 text-lg">{t('successBody')}</p>
      <Link href="/sign-in" className={buttonVariants({ className: 'mt-8' })}>
        {t('signIn')}
      </Link>
    </div>
  );
}
