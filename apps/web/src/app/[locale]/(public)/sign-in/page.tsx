import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { SignInForm } from '@/features/auth/components/sign-in-form';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { safeNext } from '@/lib/safe-next';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('signIn') };
}

const REASONS = ['account_suspended', 'tenant_suspended'] as const;
type Reason = (typeof REASONS)[number];

function reasonOf(value: unknown): Reason | null {
  return REASONS.find((reason) => reason === value) ?? null;
}

/**
 * Sign-in (contracts/routes.md §2, FR-006). `next` (checked by `safeNext`, otherwise dropped) is passed
 * to the form; `reason` explains why an existing session was refused; `reset=1` and `invited=1` confirm
 * a password reset and an accepted invitation. Signed-in users go to their dashboard.
 */
export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Rendered per request (session, query); never prerendered at build time, where no environment exists.
  await connection();
  if ((await getSessionContext()) !== null) {
    redirect(`/${locale}/dashboard`);
  }

  const query = await searchParams;
  const reason = reasonOf(query.reason);
  const t = await getTranslations('auth.signIn');
  const tErrors = await getTranslations('errors');

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <div className="mt-8 flex flex-col gap-4 empty:hidden">
        {reason === null ? null : (
          <Alert variant="warning" role="status" data-slot="sign-in-reason">
            {tErrors(reason)}
          </Alert>
        )}
        {query.reset === '1' ? (
          <Alert variant="success" role="status" data-slot="sign-in-reset">
            {t('resetDone')}
          </Alert>
        ) : null}
        {query.invited === '1' ? (
          <Alert variant="success" role="status" data-slot="sign-in-invited">
            {t('invited')}
          </Alert>
        ) : null}
      </div>
      <div className="mt-8">
        <SignInForm next={safeNext(query.next)} />
      </div>
      <p className="mt-10 border-t border-border pt-6 text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-primary underline underline-offset-4">
          {t('register')}
        </Link>
      </p>
    </div>
  );
}
