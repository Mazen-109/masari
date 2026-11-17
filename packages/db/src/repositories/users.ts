import { eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import type { Locale, UserSummary } from '../constants';
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
