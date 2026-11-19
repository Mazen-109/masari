import { divisions, withTenant } from '@masari/db';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { levelLabelKey } from '@/features/profile/level-label';
import {
  StudentProfileForm,
  type ChoiceOption,
} from '@/features/profile/components/student-profile-form';
import { isDivisionSelectable, levelOptions } from '@/features/profile/rules';
import { ClientMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import { can } from '@/server/auth/permissions';
import { requireSession } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('onboarding') };
}

/**
 * The mandatory profile step (contracts/routes.md §3; FR-024–FR-026): a student without an academic
 * profile enters the student code and picks a level (1…the college's number of levels) and one of the
 * college's active divisions. Anyone else — another role, or a student who already has a profile — goes to
 * the dashboard.
 */
export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requireSession('/onboarding', { allowIncompleteProfile: true });
  if (!can(ctx.user.role, 'profile.academic.manage_own') || ctx.studentProfile !== null) {
    redirect(`/${locale}/dashboard`);
  }

  const available = await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
    divisions.list(tx),
  );
  const t = await getTranslations('onboarding');
  const tCommon = await getTranslations('common');

  const levels: ChoiceOption[] = levelOptions(ctx.tenant.levelsCount).map((level) => ({
    value: String(level),
    label: tCommon(levelLabelKey(level)),
  }));
  const divisionOptions: ChoiceOption[] = available
    .filter((division) => isDivisionSelectable(division, null))
    .map((division) => ({
      value: division.id,
      label: locale === 'ar' ? division.nameAr : division.nameEn,
    }));

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <div className="mt-8">
        {divisionOptions.length === 0 ? (
          <p role="status">{t('noDivisions')}</p>
        ) : (
          <ClientMessages forms namespaces={['onboarding', 'profile.academic', 'profile.saved']}>
            <StudentProfileForm levels={levels} divisions={divisionOptions} />
          </ClientMessages>
        )}
      </div>
    </div>
  );
}
