import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import type { UserSummary } from '../constants';
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
