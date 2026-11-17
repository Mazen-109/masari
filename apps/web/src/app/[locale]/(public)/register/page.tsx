import { tenants } from '@masari/db';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm, type CollegeOption } from '@/features/auth/components/register-form';
import { pickCollege } from '@/features/auth/rules';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('register') };
}

/**
 * Student registration (contracts/routes.md §2, FR-002). The college is fixed by `?u=<slug>` of an active
 * college, or — whatever `?u=` says — when exactly one active college exists (`pickCollege`); otherwise
 * the visitor picks it. Signed-in users go to their dashboard.
 */
export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Rendered per request (session, query, current college list); never prerendered at build time,
  // where no environment is available.
  await connection();
  if ((await getSessionContext()) !== null) {
    redirect(`/${locale}/dashboard`);
  }

  const { u } = await searchParams;
  const options: CollegeOption[] = (await tenants.listActivePublic()).map((college) => ({
    slug: college.slug,
    name: locale === 'ar' ? college.nameAr : college.nameEn,
  }));
  const t = await getTranslations('auth.register');

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <div className="mt-8">
        <RegisterForm college={pickCollege(options, u)} colleges={options} />
      </div>
    </div>
  );
}
