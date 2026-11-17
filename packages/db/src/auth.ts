import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { getPool } from './client';
import { accounts, sessions, users, verifications } from './schema/auth';

/**
 * `@masari/db/auth` (contracts/db-api.md §2): the raw handle for the Better Auth Drizzle adapter. ESLint
 * allows importing this entry point only in `apps/web/src/server/auth/auth.ts`. Importing it reads no
 * environment variable and opens no connection; the Drizzle instance is created on the first call.
 */

export const authSchema = { users, sessions, accounts, verifications };

export type AuthSchema = typeof authSchema;
export type AuthDatabase = NodePgDatabase<AuthSchema>;

let current: { pool: pg.Pool; db: AuthDatabase } | undefined;

/** Lazy, memoised Drizzle instance on the runtime pool; rebuilt if the pool was closed and reopened. */
export function getAuthDb(): AuthDatabase {
  const pool = getPool();
  if (current?.pool !== pool) current = { pool, db: drizzle({ client: pool, schema: authSchema }) };
  return current.db;
}
