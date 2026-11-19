import { divisions, users, withTenant, type Division, type UserListPage } from '@masari/db';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UsersAnnouncer } from '@/features/admin-users/components/users-announcer';
import { UsersFilters } from '@/features/admin-users/components/users-filters';
import { UsersPagination } from '@/features/admin-users/components/users-pagination';
import {
  UsersTable,
  type AcademicChoices,
  type UserRow,
} from '@/features/admin-users/components/users-table';
import {
  pageCount,
  parseUsersFilter,
  USERS_PAGE_SIZE,
  usersQueryString,
} from '@/features/admin-users/schemas';
import { levelLabelKey } from '@/features/profile/level-label';
import { levelOptions } from '@/features/profile/rules';
import { ClientMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { log } from '@/server/log';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const PERMISSION = 'admin.users.manage';
const RETURN_TO = '/admin/users';

/**
 * The guard runs here too (same request-cached session as the page): for a role without the permission
 * `notFound()` is thrown before the title is resolved, so the title never reveals the screen.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations({ locale, namespace: 'meta' });
  // The search terms (names, emails, student codes) are in the address: never send it to another site as
  // a referrer. Masari's own requests still carry it, so access logs redact the query string of this
  // path (docs/deployment.md "Access logs").
  return { title: t('adminUsers'), referrer: 'same-origin' };
}

/**
 * The People screen of the college administration (contracts/routes.md §4; FR-029): filters from the URL
 * (an invalid value is ignored, an invalid page is page 1), then one page of 20 of the college's accounts
 * with pagination that keeps the filters. A page past the end redirects to the last page. Any other role
 * gets the 404 page.
 */
export default async function UsersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requirePermission(PERMISSION, RETURN_TO);
  const { page, ...filter } = parseUsersFilter(await searchParams);
  const t = await getTranslations('admin.users');

  let list: UserListPage;
  let allDivisions: Division[];
  try {
    // One transaction, one query at a time.
    [list, allDivisions] = await withTenant(
      { tenantId: ctx.tenant.id, userId: ctx.user.id },
      async (tx) => {
        const listed = await users.listInTenant(tx, ctx.tenant.id, {
          ...filter,
          page,
          pageSize: USERS_PAGE_SIZE,
        });
        // Inactive ones too: a student's dialog keeps offering the division they already have.
        const offered = await divisions.list(tx, { includeInactive: true });
        return [listed, offered] as const;
      },
    );
  } catch (error) {
    // The error is not passed on: only the event and the SQLSTATE are logged (UsersQueryError keeps nothing
    // else), and the error screen shows no details.
    log.error('admin.users_list_failed', {
      sqlState: error instanceof users.UsersQueryError ? (error.code ?? null) : null,
    });
    throw new Error('admin.users: the list could not be loaded');
  }

  const pages = pageCount(list.total);
  if (page > pages) redirect(`/${locale}/admin/users${usersQueryString(filter, pages)}`);

  const rows: UserRow[] = list.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    studentCode: row.studentCode,
    level: row.level,
    divisionId: row.divisionId,
    divisionName: locale === 'ar' ? row.divisionNameAr : row.divisionNameEn,
    createdAt: row.createdAt,
  }));

  // The academic-data dialog's choices, labelled like the student's own profile form.
  const tCommon = await getTranslations('common');
  const tProfile = await getTranslations('profile.academic');
  const academic: AcademicChoices = {
    levels: levelOptions(ctx.tenant.levelsCount).map((level) => ({
      value: String(level),
      label: tCommon(levelLabelKey(level)),
    })),
    divisions: allDivisions.map((division) => {
      const name = locale === 'ar' ? division.nameAr : division.nameEn;
      return {
        id: division.id,
        isActive: division.isActive,
        label: division.isActive ? name : tProfile('divisionInactive', { name }),
      };
    }),
  };

  return (
    // One column for the heading, the filters, and the table, so their edges line up (DESIGN.md "Tables");
    // only the lead keeps a reading measure.
    <div className="flex w-full min-w-0 flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('lead')}</p>
      </div>

      <UsersFilters key={usersQueryString(filter, 1)} filter={filter} />

      {/* Not a labelled section: the table's scroll region already carries the heading as its name. */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="users-list-title" className="text-xl font-semibold">
            {t('list.title')}
          </h2>
          <p className="text-muted-foreground tabular-nums" data-slot="users-count">
            {t('list.count', { count: formatNumber(list.total, locale) })}
          </p>
        </div>
        {/* Around both branches: a change that empties the list is still announced. */}
        <UsersAnnouncer>
          {rows.length === 0 ? (
            <p className="text-muted-foreground" data-slot="users-empty">
              {t('list.empty')}
            </p>
          ) : (
            <ClientMessages
              forms
              namespaces={[
                'common.actions',
                'admin.users.actions',
                'onboarding.studentCode',
                'onboarding.level',
                'onboarding.division',
              ]}
            >
              <UsersTable
                rows={rows}
                labelledBy="users-list-title"
                actorId={ctx.user.id}
                academic={academic}
              />
            </ClientMessages>
          )}
        </UsersAnnouncer>
        <UsersPagination filter={filter} page={page} pages={pages} />
      </section>
    </div>
  );
}
