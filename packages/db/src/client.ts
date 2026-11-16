import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getDbEnv } from './env';
import * as schema from './schema';

/**
 * Runtime connection (role from DATABASE_URL). The pool and the Drizzle instance are created on first use,
 * never at import time (contracts/http-and-env.md §3 "Parsing").
 */

export type Database = NodePgDatabase<typeof schema>;

const POOL_MAX = 10;

let pool: pg.Pool | undefined;
let db: Database | undefined;

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getDbEnv().DATABASE_URL, max: POOL_MAX });
  return pool;
}

export function getDb(): Database {
  db ??= drizzle({ client: getPool(), schema });
  return db;
}

/** Closes the runtime pool (tests and scripts). A later getPool() opens a new one. */
export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  db = undefined;
  if (current) await current.end();
}
