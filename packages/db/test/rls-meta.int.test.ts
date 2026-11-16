import { afterAll, describe, expect, it } from 'vitest';
import { TABLE_CLASSIFICATION, type TablePrivilege } from '../src/table-classification';
import {
  closeTestPools,
  inRuntimeTransaction,
  makeTenant,
  ownerQuery,
  runtimeQuery,
  runtimeRoleName,
} from './helpers';

// contracts/db-api.md §4: every public table is classified; every tenant-scoped table has tenant_id NOT NULL,
// RLS enabled + forced, and a tenant_isolation policy; the runtime role owns nothing and has no privileges
// beyond data-model.md §1.

const APP_GROUP_ROLE = 'masari_app';
const classified = Object.entries(TABLE_CLASSIFICATION);
const tenantScoped = classified.filter(([, entry]) => entry.scope === 'tenant');

afterAll(closeTestPools);

interface TableRow {
  name: string;
  rls: boolean;
  forced: boolean;
}

async function publicTables(): Promise<TableRow[]> {
  const result = await ownerQuery<TableRow>(
    `SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname`,
  );
  return result.rows;
}

/** Table-level privileges of a role on every relation of schema public, as "table:PRIVILEGE". */
async function tablePrivileges(role: string): Promise<string[]> {
  const result = await ownerQuery<{ entry: string }>(
    `SELECT c.relname || ':' || a.privilege_type AS entry
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname = 'public' AND a.grantee = $1::regrole
      ORDER BY 1`,
    [role],
  );
  return result.rows.map((row) => row.entry);
}

/** Column-level privileges of a role in schema public, as "table.column:PRIVILEGE". */
async function columnPrivileges(role: string): Promise<string[]> {
  const result = await ownerQuery<{ entry: string }>(
    `SELECT c.relname || '.' || att.attname || ':' || a.privilege_type AS entry
       FROM pg_attribute att
       JOIN pg_class c ON c.oid = att.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname = 'public' AND att.attnum > 0 AND NOT att.attisdropped
        AND a.grantee = $1::regrole
      ORDER BY 1`,
    [role],
  );
  return result.rows.map((row) => row.entry);
}

function expectedTablePrivileges(): string[] {
  return classified
    .flatMap(([table, entry]) => entry.privileges.map((privilege) => `${table}:${privilege}`))
    .sort();
}

function expectedColumnPrivileges(): string[] {
  return classified
    .flatMap(([table, entry]) =>
      Object.entries(entry.columnPrivileges ?? {}).flatMap(([privilege, columns]) =>
        (columns ?? []).map((column) => `${table}.${column}:${privilege as TablePrivilege}`),
      ),
    )
    .sort();
}

describe('table classification', () => {
  it('lists exactly the tables of schema public', async () => {
    const actual = (await publicTables()).map((table) => table.name);
    expect(actual).toEqual(classified.map(([table]) => table).sort());
  });

  it('requires forced RLS and a tenant_isolation policy for every tenant-scoped entry', () => {
    for (const [, entry] of tenantScoped) {
      expect(entry.rls).toBe('forced');
      expect(entry.policies).toContain('tenant_isolation');
    }
  });

  it('matches the row-level-security flags of every table', async () => {
    const tables = await publicTables();
    for (const table of tables) {
      const entry = TABLE_CLASSIFICATION[table.name];
      expect(entry, table.name).toBeDefined();
      const actual = table.forced && table.rls ? 'forced' : table.rls ? 'enabled' : 'none';
      expect(`${table.name}:${actual}`).toBe(`${table.name}:${entry?.rls}`);
    }
  });

  it('matches the policies of every table', async () => {
    const result = await ownerQuery<{ policy: string }>(
      `SELECT tablename || ':' || policyname AS policy FROM pg_policies
        WHERE schemaname = 'public' ORDER BY 1`,
    );
    const expected = classified
      .flatMap(([table, entry]) => entry.policies.map((policy) => `${table}:${policy}`))
      .sort();
    expect(result.rows.map((row) => row.policy)).toEqual(expected);
  });

  it('gives every tenant-scoped table a NOT NULL uuid tenant_id', async () => {
    for (const [table] of tenantScoped) {
      const result = await ownerQuery<{ type: string; not_null: boolean }>(
        `SELECT format_type(att.atttypid, att.atttypmod) AS type, att.attnotnull AS not_null
           FROM pg_attribute att
          WHERE att.attrelid = to_regclass('public.' || quote_ident($1))
            AND att.attname = 'tenant_id' AND NOT att.attisdropped`,
        [table],
      );
      expect(result.rows, table).toEqual([{ type: 'uuid', not_null: true }]);
    }
  });
});

describe('runtime role privileges', () => {
  it('grants masari_app exactly the table privileges of data-model.md §1', async () => {
    expect(await tablePrivileges(APP_GROUP_ROLE)).toEqual(expectedTablePrivileges());
  });

  it('grants masari_app exactly the column privileges of data-model.md §1', async () => {
    expect(await columnPrivileges(APP_GROUP_ROLE)).toEqual(expectedColumnPrivileges());
  });

  it('grants the login role nothing directly (everything comes through masari_app)', async () => {
    expect(await tablePrivileges(runtimeRoleName())).toEqual([]);
    expect(await columnPrivileges(runtimeRoleName())).toEqual([]);
  });

  it('lets neither runtime role own any object', async () => {
    const result = await ownerQuery<{ owned: number }>(
      `SELECT ((SELECT count(*) FROM pg_class WHERE relowner = ANY ($1::regrole[]))
             + (SELECT count(*) FROM pg_proc WHERE proowner = ANY ($1::regrole[]))
             + (SELECT count(*) FROM pg_namespace WHERE nspowner = ANY ($1::regrole[]))
             + (SELECT count(*) FROM pg_type WHERE typowner = ANY ($1::regrole[]))
             + (SELECT count(*) FROM pg_database WHERE datdba = ANY ($1::regrole[])))::int AS owned`,
      [[APP_GROUP_ROLE, runtimeRoleName()]],
    );
    expect(result.rows[0]?.owned).toBe(0);
  });

  it('makes the login role a safe member of masari_app', async () => {
    const result = await ownerQuery(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolcanlogin,
              pg_has_role(r.rolname, $2, 'MEMBER') AS member
         FROM pg_roles r WHERE r.rolname = $1`,
      [runtimeRoleName(), APP_GROUP_ROLE],
    );
    expect(result.rows).toEqual([
      {
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: true,
        rolcanlogin: true,
        member: true,
      },
    ]);
  });

  it('keeps masari_app a group role that cannot log in or bypass RLS', async () => {
    const result = await ownerQuery(
      `SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1`,
      [APP_GROUP_ROLE],
    );
    expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcanlogin: false }]);
  });

  it('connects as the login role and cannot create objects', async () => {
    const result = await runtimeQuery<{ who: string; schema_create: boolean; db_create: boolean }>(
      `SELECT current_user AS who,
              has_schema_privilege('public', 'CREATE') AS schema_create,
              has_database_privilege(current_database(), 'CREATE') AS db_create`,
    );
    expect(result.rows).toEqual([
      { who: runtimeRoleName(), schema_create: false, db_create: false },
    ]);
  });
});

describe('bootstrap objects', () => {
  it('app_tenant_id() is NULL without a context or with an empty one (fail closed)', async () => {
    const unset = await runtimeQuery<{ id: string | null }>('SELECT app_tenant_id() AS id');
    expect(unset.rows[0]?.id).toBeNull();
    const empty = await inRuntimeTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', '', true)`);
      return client.query<{ id: string | null }>('SELECT app_tenant_id() AS id');
    });
    expect(empty.rows[0]?.id).toBeNull();
  });

  it('app_tenant_id() returns the uuid set for the transaction', async () => {
    const tenant = await makeTenant();
    const inside = await inRuntimeTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant.id]);
      return client.query<{ id: string | null }>('SELECT app_tenant_id() AS id');
    });
    expect(inside.rows[0]?.id).toBe(tenant.id);
  });

  it('lets the runtime role read colleges through the tenants_select policy', async () => {
    const tenant = await makeTenant();
    const result = await runtimeQuery<{ slug: string }>('SELECT slug FROM tenants WHERE id = $1', [
      tenant.id,
    ]);
    expect(result.rows).toEqual([{ slug: tenant.slug }]);
  });
});
