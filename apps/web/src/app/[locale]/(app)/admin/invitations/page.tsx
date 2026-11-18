import { invitations, ROLES, withTenant } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteForm } from '@/features/invitations/components/invite-form';
import {
  InvitationsTable,
  type InvitationRow,
} from '@/features/invitations/components/invitations-table';
import { routing } from '@/i18n/routing';
import { requirePermission } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

const PERMISSION = 'admin.invitations.manage';
const RETURN_TO = '/admin/invitations';

/**
 * The guard runs here too (same request-cached session as the page): for a role without the permission
 * `notFound()` is thrown before the title is resolved, so the title never reveals the screen.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('adminInvitations') };
}

/**
 * The invitations screen of the college administration (contracts/routes.md §4; FR-020, FR-022): the
 * invite form, then the college's invitations with their status. Any other role gets the 404 page.
 */
export default async function InvitationsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requirePermission(PERMISSION, RETURN_TO);
  const t = await getTranslations('admin.invitations');
  const tRoles = await getTranslations('common.roles');

  const list = await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
    invitations.list(tx),
  );
  const rows: InvitationRow[] = list.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    displayStatus: invitation.displayStatus,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  }));
  const roles = ROLES.map((role) => ({ value: role, label: tRoles(role) }));

  return (
    // One column for the heading, the form card, and the table, so their edges line up (DESIGN.md
    // "Tables"); only the lead keeps a reading measure.
    <div className="flex w-full min-w-0 flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-balance">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('lead')}</p>
      </div>

      <Card data-slot="invite">
        <CardHeader>
          <CardTitle>
            <h2>{t('form.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm roles={roles} />
        </CardContent>
      </Card>

      {/* Not a labelled section: the table's scroll region already carries the heading as its name. */}
      <section className="flex min-w-0 flex-col gap-4">
        <h2 id="invitations-list-title" className="text-xl font-semibold">
          {t('list.title')}
        </h2>
        <InvitationsTable rows={rows} labelledBy="invitations-list-title" />
      </section>
    </div>
  );
}
