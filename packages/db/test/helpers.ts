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
  ownerPool ??= new pg.Pool({ connectionString: getAdminDbEnv().DATABASE_MIGRATION_URL, max: 4 });
  return ownerPool;
}

/** Runs a query as the owner role (fixtures only). */
export function ownerQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getOwnerPool().query<T>(text, params);
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
