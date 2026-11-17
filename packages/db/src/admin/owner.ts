import pg from 'pg';

/**
 * Owner-connection transactions for operator functions. Tenant-scoped tables have FORCED row-level security,
 * so a hosted (non-superuser) owner role is subject to `tenant_isolation` like everyone else: every write to
 * them must run after setTenantContext, in the same transaction (contracts/db-api.md §3, last line).
 */

/** Opens one connection, runs fn inside BEGIN/COMMIT (ROLLBACK when fn throws), always closes. */
export async function withOwnerTransaction<T>(
  migrationUrl: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

/** Sets app.tenant_id and app.user_id (empty = operator) transaction-locally, exactly like withTenant. */
export async function setTenantContext(client: pg.Client, tenantId: string): Promise<void> {
  await client.query(
    `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', '', true)`,
    [tenantId],
  );
}
