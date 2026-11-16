import { sql } from 'drizzle-orm';
import { getDb, type Database } from './client';

/**
 * Tenant context (contracts/db-api.md §1.2, data-model.md §2). Every read or write of college-owned data runs
 * inside withTenant: one transaction whose transaction-local settings `app.tenant_id` and `app.user_id` are
 * what the row-level-security policies see. Because the settings are transaction-local (`set_config(…, true)`),
 * they disappear at COMMIT/ROLLBACK and never leak to the next user of the pooled connection.
 */

/** Transaction handle passed to repository functions; obtainable only through withTenant. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TenantContext {
  tenantId: string;
  /** Acting user, or null for system/anonymous work (stored as an empty setting). */
  userId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Opens a transaction, sets app.tenant_id and app.user_id (transaction-local), runs fn, commits.
 * Rolls back and rethrows if fn throws. tenantId must be a uuid: anything else throws before a connection is
 * taken from the pool.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(ctx.tenantId)) throw new Error('withTenant: tenantId must be a uuid');
  const tenantId = ctx.tenantId.toLowerCase();
  const userId = ctx.userId ?? '';
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true)`,
    );
    return fn(tx);
  });
}
