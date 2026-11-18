import type { InvitationView, Role } from '@masari/db';
import { useLocale, useTranslations } from 'next-intl';
import { EmailAddress } from '@/components/email-address';
import { ScrollableTable } from '@/components/scrollable-table';
import { Badge } from '@/components/ui/badge';
import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { RevokeInvitationForm } from './revoke-invitation-form';

/** What one row shows — nothing more reaches the page than the screen needs. */
export type InvitationRow = Readonly<{
  id: string;
  email: string;
  role: Role;
  /** Stored status: `pending` rows (expired ones too) get the revoke button. */
  status: InvitationView['status'];
  displayStatus: InvitationView['displayStatus'];
  createdAt: Date;
  expiresAt: Date;
}>;

type DisplayStatus = InvitationRow['displayStatus'];

/** Status badge colours; the status word is always shown with them (DESIGN.md "Status"). */
const STATUS_VARIANT = {
  pending: 'info',
  accepted: 'success',
  expired: 'warning',
  revoked: 'neutral',
} as const satisfies Record<DisplayStatus, string>;

/**
 * The college's invitations, newest first (FR-022, contracts/routes.md §7): email (`dir="ltr"`), role,
 * display status (expired is derived from the expiry date), sent and expiry dates in Egyptian time with
 * Western digits, and a revoke button for each pending row (FR-022). A captioned table with column headers
 * inside a focusable region labelled by `labelledBy` (the section heading); when it is wider than the
 * screen it scrolls sideways (keyboard: focus it, then the arrow keys) and a hint, then also the region's
 * description, says so (ScrollableTable).
 */
export function InvitationsTable({
  rows,
  labelledBy,
}: Readonly<{ rows: readonly InvitationRow[]; labelledBy: string }>) {
  const t = useTranslations('admin.invitations.list');
  const tRoles = useTranslations('common.roles');
  const tStatuses = useTranslations('common.statuses');
  const locale = useLocale();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" data-slot="invitations-empty">
        {t('empty')}
      </p>
    );
  }

  return (
    // Six columns do not fit a phone: the table scrolls sideways inside its region, and a hint says so
    // while it overflows.
    <ScrollableTable
      data-slot="invitations-table"
      labelledBy={labelledBy}
      hintId={`${labelledBy}-scroll-hint`}
      hint={t('scrollHint')}
    >
      <TableCaption className="sr-only">{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('email')}</TableHead>
          <TableHead scope="col">{t('role')}</TableHead>
          <TableHead scope="col">{t('status')}</TableHead>
          <TableHead scope="col">{t('createdAt')}</TableHead>
          <TableHead scope="col">{t('expiresAt')}</TableHead>
          <TableHead scope="col">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-invitation={row.id} data-status={row.displayStatus}>
            {/* A long address wraps after the @ and before a dot, never inside a word (EmailAddress). */}
            <TableCell data-field="email" className="min-w-48 wrap-break-word whitespace-normal">
              <EmailAddress email={row.email} />
            </TableCell>
            <TableCell data-field="role">{tRoles(row.role)}</TableCell>
            <TableCell data-field="status">
              <Badge variant={STATUS_VARIANT[row.displayStatus]}>
                {tStatuses(row.displayStatus)}
              </Badge>
            </TableCell>
            <TableCell data-field="createdAt" className="tabular-nums">
              {formatDate(row.createdAt, locale)}
            </TableCell>
            <TableCell data-field="expiresAt" className="tabular-nums">
              {formatDate(row.expiresAt, locale)}
            </TableCell>
            <TableCell data-field="actions">
              {/* Only a pending invitation (also an expired one, which is still pending) can be revoked. */}
              {row.status === 'pending' ? (
                <RevokeInvitationForm invitationId={row.id} email={row.email} />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}
