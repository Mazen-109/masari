import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { requireSession } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('dashboard') };
}

/**
 * Home screen of signed-in users (contracts/routes.md §4; basic version): a greeting with the user's name
 * and their college. Module cards come in PR-19, the student summary in PR-22.
 */
export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requireSession('/dashboard');
  const t = await getTranslations('dashboard');

  return (
    <div>
      <h1 className="text-3xl font-bold text-balance">
        {/* The name is isolated (<bdi>) so a Latin name does not reorder the Arabic sentence. */}
        {t.rich('greeting', {
          name: ctx.user.name,
          bdi: (chunks) => <bdi>{chunks}</bdi>,
        })}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {t('college', { college: locale === 'ar' ? ctx.tenant.nameAr : ctx.tenant.nameEn })}
      </p>
    </div>
  );
}
