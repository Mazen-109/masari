import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { closePool, getPool } from '../src/client';
import { getAdminDbEnv } from '../src/env';

/**
 * Test fixtures. The owner connection is used only to arrange data (it bypasses non-forced RLS and has every
 * privilege); assertions about what the application may do go through the runtime role.
 * Inside test workers both URLs point at `masari_test` (vitest.config.ts).
 */

let ownerPool: pg.Pool | undefined;

function getOwnerPool(): pg.Pool {
  if (!ownerPool) {
    ownerPool = new pg.Pool({ connectionString: getAdminDbEnv().DATABASE_MIGRATION_URL, max: 4 });
    // An idle client that fails is discarded by the pool; the listener only prevents a crash.
    ownerPool.on('error', () => undefined);
  }
  return ownerPool;
}

/** Runs a query as the owner role (fixtures only). */
export function ownerQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getOwnerPool().query<T>(text, params);
}

/**
 * Runs a query as the owner inside a transaction that sets app.tenant_id first. Tenant-scoped tables have
 * forced RLS, so on a non-superuser owner an arrangement query without the context would silently match
 * zero rows; callers should still assert rowCount.
 */
export async function ownerTenantQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  tenantId: string,
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await getOwnerPool().connect();
  // Errors of a checked-out client are emitted on the client, not the pool; without a listener a dropped
  // connection would crash the test worker instead of failing the query.
  const onError = (): void => undefined;
  client.on('error', onError);
  let broken = false;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await client.query<T>(text, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Keep the original error; a failed ROLLBACK means the connection is unusable, so it is destroyed.
    await client.query('ROLLBACK').catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    client.off('error', onError);
    client.release(broken);
  }
}

/** Runs a query as the runtime role (DATABASE_URL), exactly as the web app would. */
export function runtimeQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Runs fn in one runtime-role transaction and always rolls it back. */
export async function inRuntimeTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** The runtime login role named in DATABASE_URL (e.g. `masari_web`). */
export function runtimeRoleName(): string {
  return decodeURIComponent(new URL(getAdminDbEnv().DATABASE_URL).username);
}

export function randomSlug(prefix = 't'): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

export interface TenantFixture {
  id: string;
  slug: string;
}

/** Creates a college with a random slug through the owner connection. */
export async function makeTenant(
  overrides: {
    slug?: string;
    nameAr?: string;
    nameEn?: string;
    status?: 'active' | 'suspended';
  } = {},
): Promise<TenantFixture> {
  const slug = overrides.slug ?? randomSlug();
  const result = await ownerQuery<TenantFixture>(
    `INSERT INTO tenants (slug, name_ar, name_en, status)
     VALUES ($1, $2, $3, $4) RETURNING id, slug`,
    [
      slug,
      overrides.nameAr ?? 'كلية تجريبية',
      overrides.nameEn ?? 'Test College',
      overrides.status ?? 'active',
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('makeTenant: no row returned');
  return row;
}

export interface UserFixture {
  id: string;
  tenantId: string;
  email: string;
}

/**
 * Creates an account row in a college through the owner connection (fixtures only; real accounts are
 * created by the auth library). Columns not given take their database defaults.
 */
export async function makeUser(
  tenantId: string,
  overrides: { email?: string; name?: string; role?: string; status?: string } = {},
): Promise<UserFixture> {
  const id = `u_${randomBytes(9).toString('hex')}`;
  const email = overrides.email ?? `${id}@example.test`;
  await ownerQuery(
    `INSERT INTO users (id, tenant_id, name, email, role, status)
     VALUES ($1, $2, $3, $4, coalesce($5, 'student'), coalesce($6, 'active'))`,
    [
      id,
      tenantId,
      overrides.name ?? 'Test User',
      email,
      overrides.role ?? null,
      overrides.status ?? null,
    ],
  );
  return { id, tenantId, email };
}

/**
 * Awaits a promise that must fail and returns its PostgreSQL error code (SQLSTATE). Drizzle wraps driver
 * errors in DrizzleQueryError with the pg error as `cause`; raw pg errors carry `code` themselves.
 */
export async function pgErrorCode(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  throw new Error('Expected a PostgreSQL error, but the promise resolved or failed without a code');
}

/** Closes both pools; call from afterAll in every integration test file. */
export async function closeTestPools(): Promise<void> {
  const owner = ownerPool;
  ownerPool = undefined;
  await Promise.all([owner?.end(), closePool()]);
}
