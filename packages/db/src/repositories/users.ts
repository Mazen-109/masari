import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../client';
import type { Locale, Role, UserStatus, UserSummary } from '../constants';
import { isUuid, type Tx } from '../context';
import { divisions, studentProfiles, users } from '../schema';
import { sqlState } from './sql-state';

/**
 * Accounts (contracts/db-api.md §1.6). Global table without RLS: functions use the pool directly and every
 * function scoped to a college filters by tenant_id itself (listInTenant also runs inside withTenant, for the
 * joined tenant-scoped tables). Only the columns of UserSummary (and, for the list, the student's profile and
 * division) are ever selected; this module never touches `accounts` (password hashes) or
 * `sessions` (tokens).
 */

const summaryColumns = {
  id: users.id,
  tenantId: users.tenantId,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  role: users.role,
  status: users.status,
  locale: users.locale,
  createdAt: users.createdAt,
};

/** Scopes a statement on the global users table to one college (no RLS on users: every filter is explicit). */
function inTenant(tenantId: string, userId: string): SQL | undefined {
  return and(eq(users.id, userId), eq(users.tenantId, tenantId));
}

/** Looks an account up by email in any college. The input is trimmed and lower-cased (the stored form). */
export async function findByEmail(email: string): Promise<UserSummary | null> {
  const normalized = email.trim().toLowerCase();
  if (normalized === '') return null;
  const rows = await getDb()
    .select(summaryColumns)
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return rows[0] ?? null;
}

/** null for an unknown id. */
export async function findById(id: string): Promise<UserSummary | null> {
  if (id === '') return null;
  const rows = await getDb().select(summaryColumns).from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** The account with this id when it belongs to tenantId; null otherwise (another college, unknown id). */
export async function findInTenant(tenantId: string, userId: string): Promise<UserSummary | null> {
  if (userId === '' || !isUuid(tenantId)) return null;
  const rows = await getDb()
    .select(summaryColumns)
    .from(users)
    .where(inTenant(tenantId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export interface UsersFilter {
  /** Part of the name, email, or student code; matched literally (no wildcards), case-insensitively. */
  q?: string;
  role?: Role;
  status?: UserStatus;
  /** 1-based page number. */
  page: number;
  /** Rows per page (1–MAX_PAGE_SIZE, i.e. 100). */
  pageSize: number;
}

export type UserListRow = UserSummary & {
  studentCode: string | null;
  level: number | null;
  divisionId: string | null;
  divisionCode: string | null;
  divisionNameAr: string | null;
  divisionNameEn: string | null;
};

export interface UserListPage {
  rows: UserListRow[];
  /** Number of accounts matching the filter, over all pages. */
  total: number;
}

/** Largest page size listInTenant accepts. */
export const MAX_PAGE_SIZE = 100;

/**
 * A failed listInTenant statement, without its parameters: the driver's errors (and Drizzle's, whose message
 * quotes the parameters) can contain the search term — a name, an email, or a student code — so the original
 * error is dropped (no message text, no cause) and only its SQLSTATE is kept.
 */
export class UsersQueryError extends Error {
  /** SQLSTATE of the database error, when there was one (e.g. `57014` for a cancelled statement). */
  readonly code: string | undefined;

  constructor(code: string | undefined) {
    super(`users.listInTenant failed${code === undefined ? '' : ` (${code})`}`);
    this.name = 'UsersQueryError';
    this.code = code;
  }
}

/**
 * Escapes the LIKE metacharacters `\`, `%` and `_` so a search term matches literally (backslash is
 * PostgreSQL's default LIKE escape character).
 */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * One page of the accounts of a college for the People screen (FR-029), newest first (created_at DESC,
 * then id), with each student's academic profile and division when there is one.
 *
 * Runs inside withTenant: users is a global table, so it is filtered by tenantId explicitly AND by the
 * college in context (a tenantId different from the context returns nothing); student_profiles and
 * divisions are limited to the college in context by their RLS policies. Exactly two statements are sent,
 * one after the other on the transaction — the page and the total — whatever the number of rows.
 * A page past the end returns no rows and the real total. Throws a RangeError for a page or page size that
 * is not a positive integer (or a page size above 100) — the caller validates both first — and a
 * UsersQueryError for any database error (the original error, which can quote the search term, is dropped).
 */
export async function listInTenant(
  tx: Tx,
  tenantId: string,
  filter: UsersFilter,
): Promise<UserListPage> {
  const { page, pageSize } = filter;
  if (!Number.isSafeInteger(page) || page < 1) throw new RangeError('users.listInTenant: page');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError('users.listInTenant: pageSize');
  }
  if (!isUuid(tenantId)) return { rows: [], total: 0 };

  const conditions: (SQL | undefined)[] = [
    eq(users.tenantId, tenantId),
    eq(users.tenantId, sql`app_tenant_id()`),
  ];
  const q = filter.q?.trim() ?? '';
  if (q !== '') {
    const pattern = `%${escapeLikePattern(q)}%`;
    conditions.push(
      or(
        ilike(users.name, pattern),
        ilike(users.email, pattern),
        ilike(studentProfiles.studentCode, pattern),
      ),
    );
  }
  if (filter.role !== undefined) conditions.push(eq(users.role, filter.role));
  if (filter.status !== undefined) conditions.push(eq(users.status, filter.status));
  const where = and(...conditions);

  // Every join also matches the college, so a row of another college never joins (even if the RLS
  // policies were dropped): the profile's college is the account's, the division's is the profile's.
  const profileJoin = and(
    eq(studentProfiles.userId, users.id),
    eq(studentProfiles.tenantId, users.tenantId),
  );
  const divisionJoin = and(
    eq(divisions.id, studentProfiles.divisionId),
    eq(divisions.tenantId, studentProfiles.tenantId),
  );

  try {
    const rows = await tx
      .select({
        ...summaryColumns,
        studentCode: studentProfiles.studentCode,
        level: studentProfiles.level,
        divisionId: studentProfiles.divisionId,
        divisionCode: divisions.code,
        divisionNameAr: divisions.nameAr,
        divisionNameEn: divisions.nameEn,
      })
      .from(users)
      .leftJoin(studentProfiles, profileJoin)
      .leftJoin(divisions, divisionJoin)
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // The join to student_profiles is needed for the student-code search; divisions never changes the count.
    const totals = await tx
      .select({ total: count() })
      .from(users)
      .leftJoin(studentProfiles, profileJoin)
      .where(where);

    return { rows, total: totals[0]?.total ?? 0 };
  } catch (error) {
    throw new UsersQueryError(sqlState(error));
  }
}

/**
 * Changes the role of an account of tenantId (FR-030) and reports the old and the new role for the audit
 * row; null when the college has no such account (nothing changes). The row is locked while it is read and
 * updated, so a concurrent change cannot slip between the two and `from` is always the role replaced.
 */
export async function setRole(
  tenantId: string,
  userId: string,
  role: Role,
): Promise<{ from: Role; to: Role } | null> {
  if (userId === '' || !isUuid(tenantId)) return null;
  return getDb().transaction(async (tx) => {
    const current = await tx
      .select({ role: users.role })
      .from(users)
      .where(inTenant(tenantId, userId))
      .for('update');
    const before = current[0];
    if (!before) return null;
    await tx
      .update(users)
      .set({ role, updatedAt: sql`now()` })
      .where(inTenant(tenantId, userId));
    return { from: before.role, to: role };
  });
}

/**
 * Suspends or reactivates an account of tenantId (FR-031); false when the college has no such account
 * (nothing changes). Revoking the sessions of a suspended account is the caller's step (sessions repository).
 */
export async function setStatus(
  tenantId: string,
  userId: string,
  status: UserStatus,
): Promise<boolean> {
  if (userId === '' || !isUuid(tenantId)) return false;
  const rows = await getDb()
    .update(users)
    .set({ status, updatedAt: sql`now()` })
    .where(inTenant(tenantId, userId))
    .returning({ id: users.id });
  return rows.length > 0;
}

/**
 * Changes the account's display name (FR-027). The caller validates it (2–100 characters after trim; the
 * CHECK constraint of data-model.md §3.2 refuses anything else). An unknown id changes nothing.
 */
export async function setName(userId: string, name: string): Promise<void> {
  if (userId === '') return;
  await getDb()
    .update(users)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(users.id, userId));
}

/**
 * Stores the account's language (FR-037), applied after sign-in on any device. An unknown id changes
 * nothing. A preference, not an audited change (contracts/server-actions.md §5.1).
 */
export async function setLocale(userId: string, locale: Locale): Promise<void> {
  if (userId === '') return;
  await getDb()
    .update(users)
    .set({ locale, updatedAt: sql`now()` })
    .where(eq(users.id, userId));
}

/**
 * Completes an account created from an invitation (contracts/server-actions.md §4.7 step 6): sets the
 * invited role and marks the address as confirmed — the invitation link proved it. Scoped to tenantId.
 * Throws (with no data in the message) when the college has no account with this id, so the caller never
 * goes on with a half-made account (it compensates instead).
 */
export async function activateInvited(tenantId: string, userId: string, role: Role): Promise<void> {
  const rows =
    userId === '' || !isUuid(tenantId)
      ? []
      : await getDb()
          .update(users)
          .set({ role, emailVerified: true, updatedAt: sql`now()` })
          .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
          .returning({ id: users.id });
  if (rows.length === 0) throw new Error('users.activateInvited: account not found in the college');
}

/** How recent an account must be for deleteJustCreated to remove it. */
const JUST_CREATED = sql`interval '10 minutes'`;

/**
 * Compensation only (contracts/server-actions.md §4.7 step 6): deletes the account created moments ago for
 * an invitation whose acceptance then failed — otherwise the address would stay taken and the invitation
 * unusable forever. The database cascades to its credential accounts and sessions and clears references to
 * it (invitations.accepted_user_id, audit_events.actor_user_id). Deletes only an account of tenantId created
 * within the last 10 minutes; false when nothing matched (another college's account, an older one, or an
 * unknown id).
 */
export async function deleteJustCreated(tenantId: string, userId: string): Promise<boolean> {
  if (userId === '' || !isUuid(tenantId)) return false;
  const rows = await getDb()
    .delete(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId),
        sql`${users.createdAt} > now() - ${JUST_CREATED}`,
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}
