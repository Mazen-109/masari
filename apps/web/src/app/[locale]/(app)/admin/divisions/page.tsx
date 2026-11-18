import { divisions, withTenant } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DivisionForm } from '@/features/divisions/components/division-form';
import { DivisionsTable, type DivisionRow } from '@/features/divisions/components/divisions-table';
import { routing } from '@/i18n/routing';
import { requirePermission } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

const PERMISSION = 'admin.settings.manage';
const RETURN_TO = '/admin/divisions';

/**
 * The guard runs here too (same request-cached session as the page): for a role without the permission
 * `notFound()` is thrown before the title is resolved, so the title never reveals the screen.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('adminDivisions') };
}

/**
 * The divisions screen of the college administration (contracts/routes.md §4; FR-033): the add form, then
 * every division of the college — inactive ones too — with edit and deactivate/reactivate. Any other role
 * gets the 404 page.
 */
export default async function DivisionsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations('admin.divisions');

  const all = await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
    divisions.list(tx, { includeInactive: true }),
  );
  const rows: DivisionRow[] = all.map((division) => ({
    id: division.id,
    code: division.code,
    nameAr: division.nameAr,
    nameEn: division.nameEn,
    sortOrder: division.sortOrder,
    isActive: division.isActive,
  }));

  return (
    // One column for the heading, the form card, and the table, so their edges line up (DESIGN.md
    // "Tables"); only the lead keeps a reading measure.
    <div className="flex w-full min-w-0 flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('lead')}</p>
      </div>

      <Card data-slot="division-add">
        <CardHeader>
          <CardTitle>
            <h2>{t('form.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DivisionForm mode="create" />
        </CardContent>
      </Card>

      {/* Not a labelled section: the table's scroll region already carries the heading as its name. */}
      <section className="flex min-w-0 flex-col gap-4">
        <h2 id="divisions-list-title" className="text-xl font-semibold">
          {t('list.title')}
        </h2>
        {rows.length === 0 ? (
          <p className="text-muted-foreground" data-slot="divisions-empty">
            {t('list.empty')}
          </p>
        ) : (
          <DivisionsTable rows={rows} labelledBy="divisions-list-title" />
        )}
      </section>
    </div>
  );
}
