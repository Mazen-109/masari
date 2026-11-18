import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import type { Locale, Role, UserSummary } from '../constants';
import { isUuid } from '../context';
import { users } from '../schema';

/**
 * Accounts (contracts/db-api.md §1.6). Global table without RLS: reads use the pool directly. Only the
 * columns of UserSummary are ever selected; this module never touches `accounts` (password hashes) or
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
