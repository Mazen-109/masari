import type { UserSummary } from '../constants';
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
