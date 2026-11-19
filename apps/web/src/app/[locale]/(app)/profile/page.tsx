import { divisions, withTenant } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SignedInLocaleSwitcher } from '@/components/shell/header-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountForm } from '@/features/profile/components/account-form';
import {
  StudentProfileForm,
  type ChoiceOption,
} from '@/features/profile/components/student-profile-form';
import { levelLabelKey } from '@/features/profile/level-label';
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
  return { title: t('profile') };
}

/**
 * The profile screen (contracts/routes.md §4; FR-027, US2 scenarios 5–6): every user changes their name
 * (email shown read-only) and their language; a student also changes level and division, with the student
 * code shown but not editable. The division picker offers the college's active divisions plus the
 * student's current one even if it was deactivated since.
 */
export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requireSession('/profile');
  const t = await getTranslations('profile');
  const tCommon = await getTranslations('common');

  const profile = can(ctx.user.role, 'profile.academic.manage_own') ? ctx.studentProfile : null;
  let academic: { levels: ChoiceOption[]; divisions: ChoiceOption[] } | null = null;
  if (profile !== null) {
    const all = await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
      divisions.list(tx, { includeInactive: true }),
    );
    academic = {
      levels: levelOptions(ctx.tenant.levelsCount).map((level) => ({
        value: String(level),
        label: tCommon(levelLabelKey(level)),
      })),
      divisions: all
        .filter((division) => isDivisionSelectable(division, profile.divisionId))
        .map((division) => {
          const name = locale === 'ar' ? division.nameAr : division.nameEn;
          return {
            value: division.id,
            label: division.isActive ? name : t('academic.divisionInactive', { name }),
          };
        }),
    };
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>

      <Card data-slot="account">
        <CardHeader>
          <CardTitle>
            <h2>{t('account.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClientMessages forms namespaces={['profile.account', 'profile.saved']}>
            <AccountForm name={ctx.user.name} email={ctx.user.email} />
          </ClientMessages>
        </CardContent>
      </Card>

      <Card data-slot="language">
        <CardHeader>
          <CardTitle>
            <h2>{t('language.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p>{t('language.current', { language: tCommon(`languages.${locale}`) })}</p>
          <SignedInLocaleSwitcher />
        </CardContent>
      </Card>

      {profile === null || academic === null ? null : (
        <Card data-slot="academic">
          <CardHeader>
            <CardTitle>
              <h2>{t('academic.title')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClientMessages forms namespaces={['onboarding', 'profile.academic', 'profile.saved']}>
              <StudentProfileForm
                levels={academic.levels}
                divisions={academic.divisions}
                current={profile}
              />
            </ClientMessages>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
