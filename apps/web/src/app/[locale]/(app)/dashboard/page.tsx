import { divisions, withTenant } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ModuleCard } from '@/features/dashboard/components/module-card';
import { StudentSummary } from '@/features/dashboard/components/student-summary';
import { levelLabelKey } from '@/features/profile/level-label';
import { routing } from '@/i18n/routing';
import { visibleModules } from '@/modules/registry';
import { requireSession } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('dashboard') };
}

/**
 * Home screen of signed-in users (contracts/routes.md §4): a greeting with the user's name, their
 * college, a student's academic profile (code, level, division), and a card per module the user may use
 * in this college (FR-035). Admin shortcut cards come with each admin screen.
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
  const tCommon = await getTranslations('common');
  const modules = visibleModules(ctx.user.role, ctx.tenant.enabledModules);
  const profile = ctx.studentProfile;
  // The profile's division may have been deactivated since; it is still shown by name.
  const division =
    profile === null
      ? null
      : await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
          divisions.findById(tx, profile.divisionId),
        );

  return (
    <div className="flex flex-col gap-10">
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
      {profile === null ? null : (
        <StudentSummary
          studentCode={profile.studentCode}
          levelLabel={tCommon(levelLabelKey(profile.level))}
          divisionName={
            division === null ? '' : locale === 'ar' ? division.nameAr : division.nameEn
          }
        />
      )}
      {modules.length === 0 ? (
        <p className="text-muted-foreground">{t('noModules')}</p>
      ) : (
        <ul
          aria-label={t('modulesLabel')}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          data-slot="module-cards"
        >
          {modules.map((key) => (
            <li key={key}>
              <ModuleCard moduleKey={key} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
