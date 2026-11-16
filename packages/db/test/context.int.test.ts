import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/client';
import { withTenant } from '../src/context';
import {
  closeTestPools,
  makeTenant,
  ownerQuery,
  pgErrorCode,
  runtimeQuery,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §4: settings are transaction-local (no leak to the next query on the same connection);
// without context, tenant-scoped tables return zero rows and reject inserts; an invalid uuid is rejected.
//
// This file builds its own probe table with the standard tenant policy of data-model.md §2, so the tests do
// not depend on the columns and grants of any product table. It lives in its own schema outside `public`,
// so the classification meta-test never sees it.

const PROBE = 'ctx_probe.notes';

let collegeA: TenantFixture;
let collegeB: TenantFixture;

beforeAll(async () => {
  await ownerQuery('DROP SCHEMA IF EXISTS ctx_probe CASCADE');
  await ownerQuery('CREATE SCHEMA ctx_probe');
  await ownerQuery(
    `CREATE TABLE ${PROBE} (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid NOT NULL DEFAULT app_tenant_id(),
       body text NOT NULL)`,
  );
  await ownerQuery(`ALTER TABLE ${PROBE} ENABLE ROW LEVEL SECURITY`);
  await ownerQuery(`ALTER TABLE ${PROBE} FORCE ROW LEVEL SECURITY`);
  await ownerQuery(
    `CREATE POLICY tenant_isolation ON ${PROBE}
       USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())`,
  );
  await ownerQuery('GRANT USAGE ON SCHEMA ctx_probe TO masari_app');
  await ownerQuery(`GRANT SELECT, INSERT ON ${PROBE} TO masari_app`);
  collegeA = await makeTenant();
  collegeB = await makeTenant();
});

afterAll(async () => {
  await ownerQuery('DROP SCHEMA IF EXISTS ctx_probe CASCADE');
  await closeTestPools();
});

async function insertNote(tenantId: string, body: string): Promise<void> {
  await withTenant({ tenantId, userId: null }, (tx) =>
    tx.execute(sql`INSERT INTO ctx_probe.notes (body) VALUES (${body})`),
  );
}

describe('withTenant', () => {
  it('sets app.tenant_id and app.user_id inside the transaction', async () => {
    const inside = await withTenant({ tenantId: collegeA.id, userId: 'user-1' }, async (tx) => {
      const result = await tx.execute<{ tenant: string | null; user: string }>(
        sql`SELECT app_tenant_id()::text AS tenant, current_setting('app.user_id') AS user`,
      );
      return result.rows[0];
    });
    expect(inside).toEqual({ tenant: collegeA.id, user: 'user-1' });
  });

  it('stores a null user as an empty setting', async () => {
    const user = await withTenant({ tenantId: collegeA.id, userId: null }, async (tx) => {
      const result = await tx.execute<{ user: string }>(
        sql`SELECT current_setting('app.user_id') AS user`,
      );
      return result.rows[0]?.user;
    });
    expect(user).toBe('');
  });

  it('does not leak the settings to the next query on the same pooled connection', async () => {
    await closePool();
    const insidePid = await withTenant({ tenantId: collegeA.id, userId: 'user-1' }, async (tx) => {
      const result = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      return result.rows[0]?.pid;
    });
    // The fresh pool holds exactly one idle connection now, so this query reuses it.
    expect(getPool().totalCount).toBe(1);
    const after = await runtimeQuery<{
      pid: number;
      tenant: string;
      user: string;
      id: string | null;
    }>(
      `SELECT pg_backend_pid() AS pid,
              coalesce(current_setting('app.tenant_id', true), '') AS tenant,
              coalesce(current_setting('app.user_id', true), '') AS user,
              app_tenant_id()::text AS id`,
    );
    expect(after.rows[0]).toEqual({ pid: insidePid, tenant: '', user: '', id: null });
  });

  it('commits the work of fn and returns its result', async () => {
    const body = `committed-${collegeA.id}`;
    const value = await withTenant({ tenantId: collegeA.id, userId: null }, async (tx) => {
      await tx.execute(sql`INSERT INTO ctx_probe.notes (body) VALUES (${body})`);
      return 42;
    });
    expect(value).toBe(42);
    const stored = await ownerQuery('SELECT tenant_id FROM ctx_probe.notes WHERE body = $1', [
      body,
    ]);
    expect(stored.rows).toEqual([{ tenant_id: collegeA.id }]);
  });

  it('rolls back and rethrows when fn throws', async () => {
    const body = `rolled-back-${collegeA.id}`;
    await expect(
      withTenant({ tenantId: collegeA.id, userId: null }, async (tx) => {
        await tx.execute(sql`INSERT INTO ctx_probe.notes (body) VALUES (${body})`);
        throw new Error('fn failed');
      }),
    ).rejects.toThrow('fn failed');
    const stored = await ownerQuery('SELECT 1 FROM ctx_probe.notes WHERE body = $1', [body]);
    expect(stored.rowCount).toBe(0);
  });

  it.each(['', 'not-a-uuid', '0'.repeat(36), "'; DROP TABLE tenants; --"])(
    'rejects the tenant id %j before using a connection',
    async (tenantId) => {
      await closePool();
      await expect(
        withTenant({ tenantId, userId: null }, () => Promise.resolve(1)),
      ).rejects.toThrow('tenantId must be a uuid');
      expect(getPool().totalCount).toBe(0);
    },
  );

  it('accepts an upper-case uuid and stores it in canonical form', async () => {
    const tenant = await withTenant(
      { tenantId: collegeA.id.toUpperCase(), userId: null },
      async (tx) => {
        const result = await tx.execute<{ tenant: string }>(
          sql`SELECT current_setting('app.tenant_id') AS tenant`,
        );
        return result.rows[0]?.tenant;
      },
    );
    expect(tenant).toBe(collegeA.id);
  });
});

describe('tenant-scoped table under the standard policy', () => {
  it('returns zero rows without a context', async () => {
    await insertNote(collegeA.id, 'visible-only-to-a');
    const result = await runtimeQuery(`SELECT * FROM ${PROBE}`);
    expect(result.rowCount).toBe(0);
  });

  it('rejects inserts without a context, with or without an explicit tenant_id', async () => {
    // 42501: new row violates the row-level security policy (checked before NOT NULL).
    expect(await pgErrorCode(runtimeQuery(`INSERT INTO ${PROBE} (body) VALUES ('orphan')`))).toBe(
      '42501',
    );
    expect(
      await pgErrorCode(
        runtimeQuery(`INSERT INTO ${PROBE} (tenant_id, body) VALUES ($1, 'forged')`, [collegeA.id]),
      ),
    ).toBe('42501');
    const stored = await ownerQuery(`SELECT 1 FROM ${PROBE} WHERE body IN ('orphan', 'forged')`);
    expect(stored.rowCount).toBe(0);
  });

  it("shows each college only its own rows and refuses writes into another college's rows", async () => {
    await insertNote(collegeA.id, 'note-a');
    await insertNote(collegeB.id, 'note-b');
    const seenByB = await withTenant({ tenantId: collegeB.id, userId: null }, async (tx) => {
      const result = await tx.execute<{ tenant_id: string }>(
        sql`SELECT DISTINCT tenant_id::text FROM ctx_probe.notes`,
      );
      return result.rows.map((row) => row.tenant_id);
    });
    expect(seenByB).toEqual([collegeB.id]);
    const code = await pgErrorCode(
      withTenant({ tenantId: collegeB.id, userId: null }, (tx) =>
        tx.execute(
          sql`INSERT INTO ctx_probe.notes (tenant_id, body) VALUES (${collegeA.id}::uuid, 'cross')`,
        ),
      ),
    );
    expect(code).toBe('42501');
  });
});
