import pg from 'pg';

/**
 * Escaping exception of contracts/db-api.md §3: role and database DDL cannot use bound parameters. Names are
 * validated against a strict pattern before anything is interpolated, identifiers are quoted with pg's
 * escapeIdentifier and the password with escapeLiteral. Validation always happens before a connection is
 * opened, so an invalid name never reaches the server.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const TEST_DATABASE = /^masari_(test|e2e)[a-z0-9_]*$/;

export function assertIdentifier(name: string, kind: 'role' | 'database'): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${kind} name: it must match ${IDENTIFIER.source}`);
  }
  return name;
}

/** True for the name of a throw-away test database (masari_test…, masari_e2e…). */
export function isThrowAwayDatabase(name: string): boolean {
  return TEST_DATABASE.test(name);
}

/** Only throw-away test databases may be dropped and recreated. */
export function assertRecreatableDatabase(name: string): string {
  assertIdentifier(name, 'database');
  if (!TEST_DATABASE.test(name)) {
    throw new Error(`Refusing to recreate database: its name must match ${TEST_DATABASE.source}`);
  }
  return name;
}

export function quoteIdentifier(name: string, kind: 'role' | 'database'): string {
  return pg.escapeIdentifier(assertIdentifier(name, kind));
}

export function quoteLiteral(value: string): string {
  return pg.escapeLiteral(value);
}

export interface ConnectionTarget {
  role: string;
  password: string;
  database: string;
}

/** Role, password, and database named in a PostgreSQL URL; role and database are validated. */
export function connectionTarget(url: string): ConnectionTarget {
  const parsed = new URL(url);
  const role = assertIdentifier(decodeURIComponent(parsed.username), 'role');
  const database = assertIdentifier(decodeURIComponent(parsed.pathname.slice(1)), 'database');
  const password = decodeURIComponent(parsed.password);
  if (password === '') throw new Error('The runtime database URL must contain a password');
  return { role, password, database };
}
