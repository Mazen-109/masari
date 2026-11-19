import { MODULE_KEYS } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { MAX_LEVEL } from '@/features/profile/schemas';
import { SettingsForm } from '@/features/tenant-settings/components/settings-form';
import { ClientMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

const PERMISSION = 'admin.settings.manage';
const RETURN_TO = '/admin/settings';

/**
 * The guard runs here too (same request-cached session as the page): for a role without the permission
 * `notFound()` is thrown before the title is resolved, so the title never reveals the screen.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('adminSettings') };
}

/**
 * The college settings screen (contracts/routes.md §4; FR-032, FR-034): names, allowed email domains,
 * number of levels, and enabled modules, starting from the settings the session context read for this
 * request. Any other role gets the 404 page.
 */
export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations('admin.settings');
  const tModules = await getTranslations('modules');

  const { nameAr, nameEn, allowedEmailDomains, levelsCount, enabledModules } = ctx.tenant;
  const levels = Array.from({ length: MAX_LEVEL }, (_, index) => ({
    value: String(index + 1),
    label: formatNumber(index + 1, locale),
  }));
  const modules = MODULE_KEYS.map((key) => ({
    value: key,
    label: tModules(`${key}.name`),
    description: tModules(`${key}.description`),
  }));

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('lead')}</p>
      </div>

      <Card data-slot="settings" className="max-w-4xl">
        <CardContent>
          <ClientMessages forms namespaces={['errors', 'admin.settings']}>
            <SettingsForm
              current={{ nameAr, nameEn, allowedEmailDomains, levelsCount, enabledModules }}
              levels={levels}
              modules={modules}
            />
          </ClientMessages>
        </CardContent>
      </Card>
    </div>
  );
}
