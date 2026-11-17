import type { UserSummary } from '../constants';
import { isThrowAwayDatabase } from './identifiers';
import { setTenantContext, withOwnerTransaction } from './owner';

/**
 * Test support (contracts/db-api.md §3): reads through the owner connection for packages/db/test and
 * apps/web/e2e only. Tenant-scoped reads set the tenant context first (forced RLS).
 */

export type UserDetails = UserSummary & { privacyConsentAt: Date | null };

/** The account with this email in any college (input trimmed and lower-cased), or null. */
export function getUserByEmail(migrationUrl: string, email: string): Promise<UserDetails | null> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query<UserDetails>(
      `SELECT id, tenant_id AS "tenantId", name, email, email_verified AS "emailVerified", role, status,
              locale, created_at AS "createdAt", privacy_consent_at AS "privacyConsentAt"
         FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    return result.rows[0] ?? null;
  });
}

/** Number of audit events with this action in the college with this slug (0 for an unknown slug). */
export function countAuditEvents(
  migrationUrl: string,
  tenantSlug: string,
  action: string,
): Promise<number> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const tenant = await client.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
      tenantSlug,
    ]);
    const tenantId = tenant.rows[0]?.id;
    if (tenantId === undefined) return 0;
    await setTenantContext(client, tenantId);
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events WHERE tenant_id = $1 AND action = $2`,
      [tenantId, action],
    );
    return result.rows[0]?.count ?? 0;
  });
}

/** Number of sessions of the account with this email (input trimmed and lower-cased); 0 if unknown. */
export function countSessionsByEmail(migrationUrl: string, email: string): Promise<number> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE users.email = $1`,
      [email.trim().toLowerCase()],
    );
    return result.rows[0]?.count ?? 0;
  });
}

/**
 * Deletes the rate-limit counters whose key starts with `keyPrefix` (all of them by default) and returns
 * how many were removed. Only on a throw-away test database (masari_test…, masari_e2e…): any other
 * database name in migrationUrl is refused before a connection is opened.
 */
export async function resetRateLimits(migrationUrl: string, keyPrefix = ''): Promise<number> {
  const database = decodeURIComponent(new URL(migrationUrl).pathname.slice(1));
  if (!isThrowAwayDatabase(database)) {
    throw new Error('Refusing to reset rate limits outside a test database');
  }
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query(
      'DELETE FROM rate_limit_counters WHERE starts_with(key, $1)',
      [keyPrefix],
    );
    return result.rowCount ?? 0;
  });
}
