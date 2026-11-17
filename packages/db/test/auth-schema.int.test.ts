import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { getAdminDbEnv, withDatabaseName } from '../src/admin';
import { authSchema, getAuthDb } from '../src/auth';
import { closePool } from '../src/client';
import {
  closeTestPools,
  makeTenant,
  makeUser,
  ownerQuery,
  ownerTenantQuery,
  pgErrorCode,
  runtimeQuery,
} from './helpers';

// data-model.md §3.2, §3.3, §3.8 (tasks.md T053): defaults and constraints of `users`, cascades from a deleted
// user, and the audit actor foreign key — including on a database that already holds audit rows.

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));
const SCRATCH_DATABASE = 'masari_test_auth_fk';
/** Tag of the last migration before the auth tables (the state a deployed PR-11 database is in). */
const LAST_BEFORE_AUTH = '0006_rate_limit_security';

afterAll(async () => {
  await ownerQuery(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`);
  await closeTestPools();
});

let sequence = 0;
function newId(): string {
  sequence += 1;
  return `test_${Date.now().toString(36)}_${sequence}`;
}

/** Inserts a user as the runtime role (as the auth library does) with only the required columns. */
function insertUser(columns: Record<string, unknown>) {
  const names = Object.keys(columns);
  const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
  return runtimeQuery(
    `INSERT INTO users (${names.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    Object.values(columns),
  );
}

describe('users', () => {
  it('defaults to role student, status active, locale ar, unverified, no consent', async () => {
    const tenant = await makeTenant();
    const id = newId();
    const result = await insertUser({
      id,
      name: 'Mona Ali',
      email: `${id}@example.test`,
      tenant_id: tenant.id,
    });
    expect(result.rows[0]).toMatchObject({
      role: 'student',
      status: 'active',
      locale: 'ar',
      email_verified: false,
      privacy_consent_at: null,
      image: null,
    });
    expect(result.rows[0]?.created_at).toBeInstanceOf(Date);
    expect(result.rows[0]?.updated_at).toBeInstanceOf(Date);
  });

  it.each([
    ['an upper-case email', { email: 'Mona@Example.test' }, '23514'],
    ['an unknown role', { role: 'superadmin' }, '23514'],
    ['an unknown status', { status: 'deleted' }, '23514'],
    ['an unknown locale', { locale: 'fr' }, '23514'],
    ['a one-character name', { name: 'M' }, '23514'],
    ['a 101-character name', { name: 'م'.repeat(101) }, '23514'],
    ['no college', { tenant_id: null }, '23502'],
    ['an unknown college', { tenant_id: '00000000-0000-4000-8000-000000000000' }, '23503'],
  ])('rejects %s', async (_label, override, code) => {
    const tenant = await makeTenant();
    const id = newId();
    const columns = { id, name: 'Mona Ali', email: `${id}@example.test`, tenant_id: tenant.id };
    expect(await pgErrorCode(insertUser({ ...columns, ...override }))).toBe(code);
  });

  it('rejects a second account with the same email, even in another college', async () => {
    const user = await makeUser((await makeTenant()).id);
    const other = await makeTenant();
    const code = await pgErrorCode(
      insertUser({ id: newId(), name: 'Mona Ali', email: user.email, tenant_id: other.id }),
    );
    expect(code).toBe('23505');
  });

  it('cannot delete a college that still has accounts (ON DELETE RESTRICT)', async () => {
    const tenant = await makeTenant();
    await makeUser(tenant.id);
    expect(await pgErrorCode(ownerQuery('DELETE FROM tenants WHERE id = $1', [tenant.id]))).toBe(
      '23503',
    );
  });
});

describe('deleting a user', () => {
  it('cascades to sessions and accounts and clears the audit actor, as the runtime role', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const keep = await makeUser(tenant.id);
    for (const owner of [user, keep]) {
      await ownerQuery(
        `INSERT INTO sessions (id, expires_at, token, user_id)
         VALUES ($1, now() + interval '1 day', $2, $3)`,
        [newId(), newId(), owner.id],
      );
      await ownerQuery(
        `INSERT INTO accounts (id, account_id, provider_id, user_id) VALUES ($1, $2, 'credential', $2)`,
        [newId(), owner.id],
      );
      await ownerTenantQuery(
        tenant.id,
        `INSERT INTO audit_events (actor_user_id, action) VALUES ($1, 'auth.sign_in')`,
        [owner.id],
      );
    }

    const deleted = await runtimeQuery('DELETE FROM users WHERE id = $1', [user.id]);
    expect(deleted.rowCount).toBe(1);

    const count = async (table: 'sessions' | 'accounts', userId: string) =>
      (await ownerQuery(`SELECT 1 FROM ${table} WHERE user_id = $1`, [userId])).rowCount;
    expect(await count('sessions', user.id)).toBe(0);
    expect(await count('accounts', user.id)).toBe(0);
    expect(await count('sessions', keep.id)).toBe(1);
    expect(await count('accounts', keep.id)).toBe(1);

    // Filtered explicitly: a superuser owner bypasses even forced row-level security, and other test
    // files write audit events of their own colleges at the same time.
    const events = await ownerTenantQuery<{ actor_user_id: string | null }>(
      tenant.id,
      'SELECT actor_user_id FROM audit_events WHERE tenant_id = $1 ORDER BY actor_user_id NULLS FIRST',
      [tenant.id],
    );
    expect(events.rows).toEqual([{ actor_user_id: null }, { actor_user_id: keep.id }]);
  });
});

describe('@masari/db/auth', () => {
  it('reads the auth tables through getAuthDb() with the library field names', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const rows = await getAuthDb()
      .select({
        id: authSchema.users.id,
        tenantId: authSchema.users.tenantId,
        emailVerified: authSchema.users.emailVerified,
      })
      .from(authSchema.users)
      .where(eq(authSchema.users.id, user.id));
    expect(rows).toEqual([{ id: user.id, tenantId: tenant.id, emailVerified: false }]);
  });

  it('memoises the instance and rebuilds it after the pool was closed', async () => {
    const first = getAuthDb();
    expect(getAuthDb()).toBe(first);
    await closePool();
    const second = getAuthDb();
    expect(second).not.toBe(first);
    expect(getAuthDb()).toBe(second);
  });
});

async function migrateFolder(url: string, folder: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: folder });
  } finally {
    await client.end();
  }
}

/** A copy of the migrations folder that ends at `lastTag`. */
function migrationsUpTo(lastTag: string): string {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const last = journal.entries.find((entry) => entry.tag === lastTag);
  if (!last) throw new Error(`Unknown migration ${lastTag}`);
  const entries = journal.entries.filter((entry) => entry.idx <= last.idx);
  const folder = mkdtempSync(join(tmpdir(), 'masari-migrations-'));
  mkdirSync(join(folder, 'meta'));
  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  const wanted = new Set(entries.map((entry) => `${entry.tag}.sql`));
  for (const file of readdirSync(MIGRATIONS).filter((name) => wanted.has(name))) {
    copyFileSync(join(MIGRATIONS, file), join(folder, file));
  }
  return folder;
}

describe('audit actor foreign key migration', () => {
  it('applies on a database that already holds audit rows with NULL actors and keeps them', async () => {
    const scratchUrl = withDatabaseName(getAdminDbEnv().DATABASE_MIGRATION_URL, SCRATCH_DATABASE);
    await ownerQuery(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`);
    await ownerQuery(`CREATE DATABASE ${SCRATCH_DATABASE}`);

    const earlier = migrationsUpTo(LAST_BEFORE_AUTH);
    try {
      await migrateFolder(scratchUrl, earlier);
    } finally {
      rmSync(earlier, { recursive: true, force: true });
    }

    const client = new pg.Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      const tenant = await client.query<{ id: string }>(
        `INSERT INTO tenants (slug, name_ar, name_en) VALUES ('fk-check', 'كلية', 'College') RETURNING id`,
      );
      const tenantId = tenant.rows[0]?.id ?? '';
      const inTenant = async (text: string) => {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
        const result = await client.query(text);
        await client.query('COMMIT');
        return result;
      };
      await inTenant(
        `INSERT INTO audit_events (action) VALUES ('tenant.created'), ('invitation.created')`,
      );

      await migrateFolder(scratchUrl, MIGRATIONS);

      const rows = await inTenant('SELECT actor_user_id FROM audit_events');
      expect(rows.rows).toEqual([{ actor_user_id: null }, { actor_user_id: null }]);
      const constraint = await client.query(
        `SELECT confrelid::regclass::text AS target, confdeltype AS on_delete
           FROM pg_constraint WHERE conname = 'audit_events_actor_user_id_fk'`,
      );
      expect(constraint.rows).toEqual([{ target: 'users', on_delete: 'n' }]);
    } finally {
      await client.end();
    }
  });
});
