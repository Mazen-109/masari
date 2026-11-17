import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDbEnv } from '../src/env';
import {
  assertSafeRuntimeRole,
  checkRoleSafety,
  ping,
  UnsafeRuntimeRoleError,
} from '../src/safety';
import { closeTestPools, ownerQuery } from './helpers';

// contracts/db-api.md §4: assertSafeRuntimeRole passes for the runtime role and throws for the owner; ping
// works. The unsafe-attribute cases switch the owner connection to scratch roles with SET LOCAL ROLE, which
// changes current_user exactly like logging in as that role would.

const BYPASS_ROLE = 'masari_test_safety_bypass';
const REPLICATION_ROLE = 'masari_test_safety_repl';
const OWNER_MEMBER_ROLE = 'masari_test_safety_member';
const OWNER_SET_ONLY_ROLE = 'masari_test_safety_set_only';
const SCRATCH_ROLES = [BYPASS_ROLE, REPLICATION_ROLE, OWNER_MEMBER_ROLE, OWNER_SET_ONLY_ROLE];

let owner: pg.Client;

async function dropScratchRoles(): Promise<void> {
  for (const role of SCRATCH_ROLES) await ownerQuery(`DROP ROLE IF EXISTS ${role}`);
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: getAdminDbEnv().DATABASE_MIGRATION_URL });
  await owner.connect();
  await dropScratchRoles();
  await ownerQuery(`CREATE ROLE ${BYPASS_ROLE} NOLOGIN BYPASSRLS`);
  await ownerQuery(`CREATE ROLE ${REPLICATION_ROLE} NOLOGIN REPLICATION`);
  await ownerQuery(`CREATE ROLE ${OWNER_MEMBER_ROLE} NOLOGIN`);
  const me = await ownerQuery<{ name: string }>('SELECT quote_ident(current_user) AS name');
  const ownerName = me.rows[0]?.name ?? 'missing_owner';
  await ownerQuery(`GRANT ${ownerName} TO ${OWNER_MEMBER_ROLE}`);
  // Membership without inherited privileges: the member can still SET ROLE to the owner (PostgreSQL 16+).
  await ownerQuery(`CREATE ROLE ${OWNER_SET_ONLY_ROLE} NOLOGIN`);
  await ownerQuery(`GRANT ${ownerName} TO ${OWNER_SET_ONLY_ROLE} WITH INHERIT FALSE, SET TRUE`);
});

afterAll(async () => {
  await owner.end();
  await dropScratchRoles();
  await closeTestPools();
});

/** Runs the safety check on the owner connection, optionally as another role. */
async function checkAs(role?: string): Promise<void> {
  await owner.query('BEGIN');
  try {
    if (role) await owner.query(`SET LOCAL ROLE ${role}`);
    await checkRoleSafety((text) => owner.query(text));
  } finally {
    await owner.query('ROLLBACK');
  }
}

describe('ping', () => {
  it('succeeds on the runtime connection', async () => {
    await expect(ping()).resolves.toBeUndefined();
  });
});

describe('assertSafeRuntimeRole', () => {
  it('passes for the runtime role', async () => {
    await expect(assertSafeRuntimeRole()).resolves.toBeUndefined();
  });

  it('throws when connected as the owner', async () => {
    await expect(checkAs()).rejects.toThrow('Unsafe database role');
    // The web app's start-up check recognises this class and prints its message (instrumentation.ts).
    await expect(checkAs()).rejects.toBeInstanceOf(UnsafeRuntimeRoleError);
  });

  it('throws for a role with BYPASSRLS', async () => {
    await expect(checkAs(BYPASS_ROLE)).rejects.toThrow('(BYPASSRLS)');
  });

  it('throws for a role with REPLICATION', async () => {
    await expect(checkAs(REPLICATION_ROLE)).rejects.toThrow('(REPLICATION)');
  });

  it('throws for a role that inherits the table owner', async () => {
    await expect(checkAs(OWNER_MEMBER_ROLE)).rejects.toThrow('(owns tables)');
  });

  it('throws for a role that may only SET ROLE to the table owner (INHERIT FALSE)', async () => {
    const grant = await ownerQuery<{ inherit: boolean; set: boolean }>(
      `SELECT m.inherit_option AS inherit, m.set_option AS set
         FROM pg_auth_members m
        WHERE m.member = $1::regrole AND m.roleid = current_user::regrole`,
      [OWNER_SET_ONLY_ROLE],
    );
    expect(grant.rows).toEqual([{ inherit: false, set: true }]);
    await expect(checkAs(OWNER_SET_ONLY_ROLE)).rejects.toThrow('(owns tables)');
  });

  it('throws when the current role cannot be found', async () => {
    await expect(checkRoleSafety(() => Promise.resolve({ rows: [] }))).rejects.toThrow('not found');
  });
});
