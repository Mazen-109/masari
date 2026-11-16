import { describe, expect, it } from 'vitest';
import { recreateDatabase, withDatabaseName } from './database';
import {
  assertIdentifier,
  assertRecreatableDatabase,
  connectionTarget,
  quoteIdentifier,
  quoteLiteral,
} from './identifiers';
import { ensureRuntimeRole, runtimeRoleSql } from './migrate';

// Nothing listens on port 1: if a function opened a connection before validating its input, these tests
// would fail with a connection error instead of the validation error they expect.
const UNREACHABLE_OWNER = 'postgres://owner:owner-pw@127.0.0.1:1/masari';
const RUNTIME = 'postgres://masari_web:web-pw@127.0.0.1:1/masari';

describe('withDatabaseName', () => {
  it('replaces only the database name', () => {
    expect(
      withDatabaseName('postgres://u:p@db.example:5433/masari?sslmode=require', 'masari_test'),
    ).toBe('postgres://u:p@db.example:5433/masari_test?sslmode=require');
  });

  it('keeps percent-encoded credentials and the postgresql scheme', () => {
    expect(withDatabaseName('postgresql://u:p%40ss%2Fw@localhost/masari', 'masari_e2e')).toBe(
      'postgresql://u:p%40ss%2Fw@localhost/masari_e2e',
    );
  });
});

describe('name validation', () => {
  it.each(['masari_web', '_x', 'a'.repeat(63)])('accepts the identifier %s', (name) => {
    expect(assertIdentifier(name, 'role')).toBe(name);
  });

  it.each(['', 'Masari', '1abc', 'a-b', 'a b', 'x"; DROP ROLE y; --', 'a'.repeat(64)])(
    'rejects the identifier %j',
    (name) => {
      expect(() => assertIdentifier(name, 'role')).toThrow('Invalid role name');
      expect(() => quoteIdentifier(name, 'database')).toThrow('Invalid database name');
    },
  );

  it.each(['masari_test', 'masari_e2e', 'masari_test_scratch', 'masari_e2e2'])(
    'allows recreating %s',
    (name) => {
      expect(assertRecreatableDatabase(name)).toBe(name);
    },
  );

  it.each(['masari', 'postgres', 'masari_prod', 'test_masari', 'masari_test-x'])(
    'refuses to recreate %s',
    (name) => {
      expect(() => assertRecreatableDatabase(name)).toThrow();
    },
  );
});

describe('escaping', () => {
  it('quotes identifiers and escapes passwords as literals', () => {
    expect(quoteIdentifier('masari_web', 'role')).toBe('"masari_web"');
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral('back\\slash')).toBe(" E'back\\\\slash'");
  });

  it('builds CREATE ROLE with every attribute for a new role', () => {
    expect(runtimeRoleSql('masari_web', "pa'ss", undefined)).toBe(
      `CREATE ROLE "masari_web" WITH LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE INHERIT PASSWORD 'pa''ss'`,
    );
  });

  it('builds ALTER ROLE with the password and only the attributes that differ', () => {
    const safe = {
      rolsuper: false,
      rolbypassrls: false,
      rolreplication: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: true,
      rolcanlogin: true,
    };
    expect(runtimeRoleSql('masari_web', 'pw', safe)).toBe(
      `ALTER ROLE "masari_web" WITH PASSWORD 'pw'`,
    );
    expect(
      runtimeRoleSql('masari_web', 'pw', { ...safe, rolbypassrls: true, rolcanlogin: false }),
    ).toBe(`ALTER ROLE "masari_web" WITH LOGIN NOBYPASSRLS PASSWORD 'pw'`);
    expect(runtimeRoleSql('masari_web', 'pw', { ...safe, rolreplication: true })).toBe(
      `ALTER ROLE "masari_web" WITH NOREPLICATION PASSWORD 'pw'`,
    );
  });

  it('refuses an invalid role name before building any SQL', () => {
    expect(() => runtimeRoleSql('bad-role', 'pw', undefined)).toThrow('Invalid role name');
  });
});

describe('connectionTarget', () => {
  it('extracts role, password, and database', () => {
    expect(connectionTarget('postgres://masari_web:p%40ss@localhost:5432/masari')).toEqual({
      role: 'masari_web',
      password: 'p@ss',
      database: 'masari',
    });
  });

  it('requires a password', () => {
    expect(() => connectionTarget('postgres://masari_web@localhost/masari')).toThrow('password');
  });
});

describe('validation happens before any SQL is sent', () => {
  it('recreateDatabase refuses a non-test database name', async () => {
    await expect(recreateDatabase(UNREACHABLE_OWNER, RUNTIME, 'masari')).rejects.toThrow(
      'Refusing to recreate database',
    );
  });

  it('recreateDatabase refuses an injected database name', async () => {
    await expect(
      recreateDatabase(UNREACHABLE_OWNER, RUNTIME, 'masari_test"; DROP DATABASE masari; --'),
    ).rejects.toThrow('Invalid database name');
  });

  it('recreateDatabase refuses to drop the maintenance database', async () => {
    await expect(
      recreateDatabase(withDatabaseName(UNREACHABLE_OWNER, 'masari_test'), RUNTIME, 'masari_test'),
    ).rejects.toThrow('maintenance connection');
  });

  it('ensureRuntimeRole refuses an invalid role name', async () => {
    await expect(
      ensureRuntimeRole(UNREACHABLE_OWNER, 'postgres://Bad-Role:pw@127.0.0.1:1/masari'),
    ).rejects.toThrow('Invalid role name');
  });

  it('ensureRuntimeRole refuses a runtime role equal to the owner role', async () => {
    await expect(
      ensureRuntimeRole(UNREACHABLE_OWNER, 'postgres://owner:other-pw@127.0.0.1:1/masari'),
    ).rejects.toThrow('name the same role');
  });

  it('ensureRuntimeRole refuses an invalid database name', async () => {
    await expect(
      ensureRuntimeRole(UNREACHABLE_OWNER, 'postgres://masari_web:pw@127.0.0.1:1/Masari-DB'),
    ).rejects.toThrow('Invalid database name');
  });
});
