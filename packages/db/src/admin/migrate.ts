import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { connectionTarget, quoteIdentifier, quoteLiteral } from './identifiers';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));
const APP_GROUP_ROLE = 'masari_app';

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function countApplied(client: pg.Client): Promise<number> {
  const exists = await client.query<{ relation: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS relation`,
  );
  if (!exists.rows[0]?.relation) return 0;
  const result = await client.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
  );
  return result.rows[0]?.count ?? 0;
}

/** Applies every pending migration with the owner connection; returns how many were applied now. */
export function applyMigrations(migrationUrl: string): Promise<number> {
  return withClient(migrationUrl, async (client) => {
    const before = await countApplied(client);
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
    return (await countApplied(client)) - before;
  });
}

export async function runMigrations(migrationUrl: string): Promise<void> {
  await applyMigrations(migrationUrl);
}

interface RoleAttributes {
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolreplication: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolcanlogin: boolean;
}

const REQUIRED_ATTRIBUTES: ReadonlyArray<[keyof RoleAttributes, boolean, string]> = [
  ['rolcanlogin', true, 'LOGIN'],
  ['rolsuper', false, 'NOSUPERUSER'],
  ['rolbypassrls', false, 'NOBYPASSRLS'],
  ['rolreplication', false, 'NOREPLICATION'],
  ['rolcreatedb', false, 'NOCREATEDB'],
  ['rolcreaterole', false, 'NOCREATEROLE'],
  ['rolinherit', true, 'INHERIT'],
];

/**
 * Role DDL for the runtime login role. A new role gets every attribute explicitly. An existing role gets its
 * password plus only the attributes that differ, because changing SUPERUSER, BYPASSRLS, or REPLICATION — even
 * to the value it already has — needs rights that a hosted owner role may not have.
 */
export function runtimeRoleSql(
  role: string,
  password: string,
  current: RoleAttributes | undefined,
): string {
  const name = quoteIdentifier(role, 'role');
  const secret = quoteLiteral(password);
  if (!current) {
    const all = REQUIRED_ATTRIBUTES.map(([, , keyword]) => keyword).join(' ');
    return `CREATE ROLE ${name} WITH ${all} PASSWORD ${secret}`;
  }
  const changes = REQUIRED_ATTRIBUTES.filter(([key, wanted]) => current[key] !== wanted).map(
    ([, , keyword]) => keyword,
  );
  return `ALTER ROLE ${name} WITH ${[...changes, `PASSWORD ${secret}`].join(' ')}`;
}

/**
 * Creates or updates the login role named in runtimeUrl (password from the URL; NOSUPERUSER NOBYPASSRLS
 * NOREPLICATION NOCREATEDB NOCREATEROLE INHERIT), grants it CONNECT and membership of masari_app. Idempotent.
 * Refuses, before any SQL is sent, a runtime role equal to the owner role of migrationUrl: that would
 * strip the owner's own attributes and leave the web app running as the owner of every table.
 */
export async function ensureRuntimeRole(migrationUrl: string, runtimeUrl: string): Promise<void> {
  const target = connectionTarget(runtimeUrl);
  if (decodeURIComponent(new URL(migrationUrl).username) === target.role) {
    throw new Error(
      'DATABASE_URL and DATABASE_MIGRATION_URL name the same role; the runtime role must be a separate role',
    );
  }
  await withClient(migrationUrl, async (client) => {
    const existing = await client.query<RoleAttributes>(
      `SELECT rolsuper, rolbypassrls, rolreplication, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
         FROM pg_roles WHERE rolname = $1`,
      [target.role],
    );
    await client.query(runtimeRoleSql(target.role, target.password, existing.rows[0]));
    const member = await client.query<{ member: boolean }>(
      `SELECT pg_has_role($1, $2, 'MEMBER') AS member`,
      [target.role, APP_GROUP_ROLE],
    );
    if (!member.rows[0]?.member) {
      await client.query(
        `GRANT ${quoteIdentifier(APP_GROUP_ROLE, 'role')} TO ${quoteIdentifier(target.role, 'role')}`,
      );
    }
    await client.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(target.database, 'database')} TO ${quoteIdentifier(target.role, 'role')}`,
    );
  });
}
