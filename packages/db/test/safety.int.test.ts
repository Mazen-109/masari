import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDbEnv } from '../src/env';
import { assertSafeRuntimeRole, checkRoleSafety, ping } from '../src/safety';
import { closeTestPools, ownerQuery } from './helpers';

// contracts/db-api.md §4: assertSafeRuntimeRole passes for the runtime role and throws for the owner; ping
// works. The unsafe-attribute cases switch the owner connection to scratch roles with SET LOCAL ROLE, which
// changes current_user exactly like logging in as that role would.

const BYPASS_ROLE = 'masari_test_safety_bypass';
const REPLICATION_ROLE = 'masari_test_safety_repl';
const OWNER_MEMBER_ROLE = 'masari_test_safety_member';
const SCRATCH_ROLES = [BYPASS_ROLE, REPLICATION_ROLE, OWNER_MEMBER_ROLE];

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
  await ownerQuery(`GRANT ${me.rows[0]?.name ?? 'missing_owner'} TO ${OWNER_MEMBER_ROLE}`);
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

  it('throws when the current role cannot be found', async () => {
    await expect(checkRoleSafety(() => Promise.resolve({ rows: [] }))).rejects.toThrow('not found');
  });
});
