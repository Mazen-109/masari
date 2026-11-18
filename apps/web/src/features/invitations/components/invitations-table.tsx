import type { InvitationView, Role } from '@masari/db';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';

/** What one row shows — nothing more reaches the page than the screen needs. */
export type InvitationRow = Readonly<{
  id: string;
  email: string;
  role: Role;
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
 * Western digits. A captioned table with column headers inside a focusable region labelled by
 * `labelledBy` (the section heading); below 640 px it scrolls sideways (keyboard: focus it, then the arrow
 * keys) and a visible hint, also the region's description, says so. Row actions arrive with revoke (PR-29).
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

  const hintId = `${labelledBy}-scroll-hint`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Five columns do not fit a phone: the table scrolls sideways, and the hint says so. */}
      <p id={hintId} className="text-sm text-muted-foreground sm:hidden">
        {t('scrollHint')}
      </p>
      <Table
        data-slot="invitations-table"
        containerProps={{
          role: 'region',
          'aria-labelledby': labelledBy,
          'aria-describedby': hintId,
          tabIndex: 0,
        }}
      >
        <TableCaption className="sr-only">{t('caption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('email')}</TableHead>
            <TableHead scope="col">{t('role')}</TableHead>
            <TableHead scope="col">{t('status')}</TableHead>
            <TableHead scope="col">{t('createdAt')}</TableHead>
            <TableHead scope="col">{t('expiresAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-invitation={row.id} data-status={row.displayStatus}>
              {/* A long address wraps (anywhere) instead of pushing the other columns out of view. */}
              <TableCell data-field="email" className="min-w-48 wrap-anywhere whitespace-normal">
                <bdi dir="ltr">{row.email}</bdi>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
