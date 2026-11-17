import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  ensureRuntimeRole,
  getAdminDbEnv,
  recreateDatabase,
  withDatabaseName,
} from '../src/admin';
import { getDb } from '../src/client';
import { closeTestPools, ownerQuery, runtimeQuery } from './helpers';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));
const SCRATCH_DATABASE = 'masari_test_scratch';
const SCRATCH_ROLE = 'masari_test_scratch_role';

const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8')) as {
  entries: unknown[];
};

/** DROP OWNED also revokes the role's CONNECT grants, without which DROP ROLE would fail. */
async function dropScratchRole(): Promise<void> {
  const exists = await ownerQuery('SELECT 1 FROM pg_roles WHERE rolname = $1', [SCRATCH_ROLE]);
  if (exists.rowCount === 0) return;
  await ownerQuery(`DROP OWNED BY ${SCRATCH_ROLE}`);
  await ownerQuery(`DROP ROLE ${SCRATCH_ROLE}`);
}

afterAll(async () => {
  await ownerQuery(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`);
  await dropScratchRole();
  await closeTestPools();
});

describe('test database', () => {
  it('points both connections of the test workers at masari_test, never the development database', async () => {
    const owner = await ownerQuery<{ db: string }>('SELECT current_database() AS db');
    const runtime = await getDb().execute<{ db: string }>(sql`SELECT current_database() AS db`);
    expect(owner.rows[0]?.db).toBe('masari_test');
    expect(runtime.rows[0]?.db).toBe('masari_test');
  });
});

describe('migrations', () => {
  it('contain no password or role credentials', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql'));
    expect(files.length).toBe(journal.entries.length);
    for (const file of files) {
      // The one exempt occurrence is the auth library's hash column `accounts.password` (data-model.md
      // §3.3): a column declaration, not a credential. Anything else naming a password still fails.
      const sqlText = readFileSync(`${MIGRATIONS}/${file}`, 'utf8')
        .replace(/--[^\n]*/g, '')
        .replace(/^\t"password" text,$/m, '');
      expect(sqlText, file).not.toMatch(/password|masari_dev_/i);
    }
  });

  it('are idempotent: a second run applies nothing', async () => {
    expect(await applyMigrations(getAdminDbEnv().DATABASE_MIGRATION_URL)).toBe(0);
  });

  it('recreateDatabase builds a fresh database with every migration and the runtime role', async () => {
    const env = getAdminDbEnv();
    await recreateDatabase(env.DATABASE_MIGRATION_URL, env.DATABASE_URL, SCRATCH_DATABASE);
    // Recreating again drops the previous copy instead of failing.
    await recreateDatabase(env.DATABASE_MIGRATION_URL, env.DATABASE_URL, SCRATCH_DATABASE);
    const scratchOwner = withDatabaseName(env.DATABASE_MIGRATION_URL, SCRATCH_DATABASE);
    expect(await applyMigrations(scratchOwner)).toBe(0);

    const scratch = await runtimeQuery<{ connect: boolean }>(
      `SELECT has_database_privilege($1, 'CONNECT') AS connect`,
      [SCRATCH_DATABASE],
    );
    expect(scratch.rows[0]?.connect).toBe(true);
  });
});

describe('ensureRuntimeRole', () => {
  const env = () => getAdminDbEnv();
  const runtimeUrl = () => {
    const url = new URL(env().DATABASE_URL);
    url.username = SCRATCH_ROLE;
    url.password = "scratch-pw-with-'quote";
    return url.toString();
  };

  async function attributes() {
    const result = await ownerQuery(
      `SELECT rolsuper, rolbypassrls, rolreplication, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin,
              pg_has_role(rolname, 'masari_app', 'MEMBER') AS member,
              has_database_privilege(rolname, current_database(), 'CONNECT') AS connect
         FROM pg_roles WHERE rolname = $1`,
      [SCRATCH_ROLE],
    );
    return result.rows[0];
  }

  const SAFE = {
    rolsuper: false,
    rolbypassrls: false,
    rolreplication: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: true,
    rolcanlogin: true,
    member: true,
    connect: true,
  };

  it('creates a missing role with safe attributes, membership, and CONNECT', async () => {
    await dropScratchRole();
    await ensureRuntimeRole(env().DATABASE_MIGRATION_URL, runtimeUrl());
    expect(await attributes()).toEqual(SAFE);
  });

  it('repairs unsafe attributes of an existing role and is idempotent', async () => {
    await ensureRuntimeRole(env().DATABASE_MIGRATION_URL, runtimeUrl());
    await ownerQuery(`ALTER ROLE ${SCRATCH_ROLE} BYPASSRLS REPLICATION CREATEDB NOINHERIT`);
    await ensureRuntimeRole(env().DATABASE_MIGRATION_URL, runtimeUrl());
    await ensureRuntimeRole(env().DATABASE_MIGRATION_URL, runtimeUrl());
    expect(await attributes()).toEqual(SAFE);
  });
});
