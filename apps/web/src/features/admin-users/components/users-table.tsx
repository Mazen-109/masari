import { ROLES, type Role, type UserStatus } from '@masari/db';
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
import type { ChoiceOption } from '@/features/profile/components/student-profile-form';
import { levelLabelKey } from '@/features/profile/level-label';
import { isDivisionSelectable } from '@/features/profile/rules';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RoleDialog, type RoleOption } from './role-dialog';
import { StatusButton } from './status-button';
import { StudentProfileDialog } from './student-profile-dialog';

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
  divisionId: string | null;
  /** The division's name in the current language. */
  divisionName: string | null;
  createdAt: Date;
}>;

/** One of the college's divisions, every one (inactive too), named in the current language. */
export type DivisionChoice = Readonly<{ id: string; isActive: boolean; label: string }>;

/** The choices of the academic-data dialog: the college's levels and all of its divisions. */
export type AcademicChoices = Readonly<{
  levels: readonly ChoiceOption[];
  divisions: readonly DivisionChoice[];
}>;

/**
 * The divisions a student's dialog offers: the active ones, and the student's current one even when it
 * was deactivated since — the same choice as the student's own profile form (FR-026).
 */
function divisionOptions(choices: AcademicChoices, currentId: string | null): ChoiceOption[] {
  return choices.divisions
    .filter((division) => isDivisionSelectable(division, currentId))
    .map((division) => ({ value: division.id, label: division.label }));
}

/** The saved academic profile of a row, or null when the student has not completed it. */
function currentProfile(row: UserRow) {
  const { studentCode, level, divisionId } = row;
  return studentCode === null || level === null || divisionId === null
    ? null
    : { studentCode, level, divisionId };
}

/** Status badge colours; the status word is always shown with them (DESIGN.md "Status"). */
const STATUS_VARIANT = {
  active: 'success',
  suspended: 'destructive',
} as const satisfies Record<UserStatus, string>;

/**
 * Nine columns must fit the desktop content column (DESIGN.md "Tables", dense variant): 12 px inline
 * padding, headers and text cells wrap at word boundaries, while badges and student codes stay whole.
 * Below that width the region scrolls sideways as usual.
 */
const CELL = 'px-3';
const WRAP = 'px-3 whitespace-normal wrap-break-word';
const HEAD = 'px-3 whitespace-normal';

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
 * the date the account was created, in Egyptian time with Western digits, and the row actions — change
 * role, suspend or reactivate (FR-030, FR-031), and for a student the academic-data dialog (FR-028) — on
 * every row except the acting administrator's own (`actorId`), which says "your account" instead. A
 * captioned table with column headers inside a focusable region labelled by `labelledBy`; when it is wider
 * than the screen it scrolls sideways and a hint says so (ScrollableTable). The caller renders the empty
 * state.
 */
export function UsersTable({
  rows,
  labelledBy,
  actorId,
  academic,
}: Readonly<{
  rows: readonly UserRow[];
  labelledBy: string;
  actorId: string;
  academic: AcademicChoices;
}>) {
  const t = useTranslations('admin.users.list');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('common.roles');
  const tStatuses = useTranslations('common.statuses');
  const locale = useLocale();
  const tActions = useTranslations('admin.users.actions');
  const none = <None label={t('none')} />;
  const roles: RoleOption[] = ROLES.map((role) => ({ value: role, label: tRoles(role) }));

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
          <TableHead scope="col" className={HEAD}>
            {t('name')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('email')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('role')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('status')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('studentCode')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('level')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('division')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('joinedAt')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {tActions('column')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-user={row.id} data-role={row.role} data-status={row.status}>
            <TableCell data-field="name" className={WRAP}>
              <bdi>{row.name}</bdi>
            </TableCell>
            {/* Prefers to wrap after the @ and before a dot (EmailAddress). */}
            <TableCell data-field="email" className={WRAP}>
              <EmailAddress email={row.email} />
            </TableCell>
            <TableCell data-field="role" className={WRAP}>
              {tRoles(row.role)}
            </TableCell>
            <TableCell data-field="status" className={CELL}>
              <Badge variant={STATUS_VARIANT[row.status]}>{tStatuses(row.status)}</Badge>
            </TableCell>
            <TableCell data-field="studentCode" className={CELL}>
              {row.studentCode === null ? none : <bdi dir="ltr">{row.studentCode}</bdi>}
            </TableCell>
            <TableCell data-field="level" className={WRAP}>
              {row.level === null ? none : tCommon(levelLabelKey(row.level))}
            </TableCell>
            <TableCell data-field="division" className={WRAP}>
              {row.divisionName === null ? none : <bdi>{row.divisionName}</bdi>}
            </TableCell>
            <TableCell data-field="joinedAt" className={cn(WRAP, 'tabular-nums')}>
              {formatDate(row.createdAt, locale)}
            </TableCell>
            <TableCell data-field="actions" className={CELL}>
              {row.id === actorId ? (
                <span className="text-muted-foreground" data-slot="own-account">
                  {tActions('self')}
                </span>
              ) : (
                // Side by side when the column has room, one under the other when it does not.
                <div className="flex flex-wrap items-start gap-2">
                  <RoleDialog userId={row.id} name={row.name} role={row.role} roles={roles} />
                  <StatusButton userId={row.id} name={row.name} status={row.status} />
                  {row.role === 'student' ? (
                    <StudentProfileDialog
                      userId={row.id}
                      name={row.name}
                      current={currentProfile(row)}
                      levels={academic.levels}
                      divisions={divisionOptions(academic, row.divisionId)}
                    />
                  ) : null}
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}
