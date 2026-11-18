import type { Role, UserStatus } from '@masari/db';
import { useLocale, useTranslations } from 'next-intl';
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
import { levelLabelKey } from '@/features/profile/level-label';
import { formatDate } from '@/lib/format';

/** What one row shows — nothing more reaches the page than the screen needs. */
export type UserRow = Readonly<{
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  /** Academic profile of a student; null for staff and for a student who has not completed it yet. */
  studentCode: string | null;
  level: number | null;
  /** The division's name in the current language. */
  divisionName: string | null;
  createdAt: Date;
}>;

/** Status badge colours; the status word is always shown with them (DESIGN.md "Status"). */
const STATUS_VARIANT = {
  active: 'success',
  suspended: 'destructive',
} as const satisfies Record<UserStatus, string>;

/** A visual mark, not text: hidden from assistive technology, which reads the word beside it. */
const DASH = '—';

/** An empty academic cell: a dash on screen, a word for assistive technology. */
function None({ label }: Readonly<{ label: string }>) {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        {DASH}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * One page of the college's accounts, newest first (FR-029, contracts/routes.md §4): name, email
 * (`dir="ltr"`), role, status badge with its word, a student's code (`dir="ltr"`), level and division, and
 * the date the account was created, in Egyptian time with Western digits. A captioned table with column
 * headers inside a focusable region labelled by `labelledBy`; when it is wider than the screen it scrolls
 * sideways and a hint says so (ScrollableTable). The caller renders the empty state.
 */
export function UsersTable({
  rows,
  labelledBy,
}: Readonly<{ rows: readonly UserRow[]; labelledBy: string }>) {
  const t = useTranslations('admin.users.list');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('common.roles');
  const tStatuses = useTranslations('common.statuses');
  const locale = useLocale();
  const none = <None label={t('none')} />;

  return (
    <ScrollableTable
      data-slot="users-table"
      labelledBy={labelledBy}
      hintId={`${labelledBy}-scroll-hint`}
      hint={t('scrollHint')}
    >
      <TableCaption className="sr-only">{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('name')}</TableHead>
          <TableHead scope="col">{t('email')}</TableHead>
          <TableHead scope="col">{t('role')}</TableHead>
          <TableHead scope="col">{t('status')}</TableHead>
          <TableHead scope="col">{t('studentCode')}</TableHead>
          <TableHead scope="col">{t('level')}</TableHead>
          <TableHead scope="col">{t('division')}</TableHead>
          <TableHead scope="col">{t('joinedAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-user={row.id} data-role={row.role} data-status={row.status}>
            <TableCell data-field="name" className="min-w-40 whitespace-normal">
              <bdi>{row.name}</bdi>
            </TableCell>
            {/* A long address wraps (anywhere) instead of pushing the other columns out of view. */}
            <TableCell data-field="email" className="min-w-48 wrap-anywhere whitespace-normal">
              <bdi dir="ltr">{row.email}</bdi>
            </TableCell>
            <TableCell data-field="role">{tRoles(row.role)}</TableCell>
            <TableCell data-field="status">
              <Badge variant={STATUS_VARIANT[row.status]}>{tStatuses(row.status)}</Badge>
            </TableCell>
            <TableCell data-field="studentCode">
              {row.studentCode === null ? none : <bdi dir="ltr">{row.studentCode}</bdi>}
            </TableCell>
            <TableCell data-field="level">
              {row.level === null ? none : tCommon(levelLabelKey(row.level))}
            </TableCell>
            <TableCell data-field="division" className="min-w-32 whitespace-normal">
              {row.divisionName === null ? none : <bdi>{row.divisionName}</bdi>}
            </TableCell>
            <TableCell data-field="joinedAt" className="tabular-nums">
              {formatDate(row.createdAt, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}
