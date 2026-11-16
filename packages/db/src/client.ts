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

/**
 * An idle pooled client can fail (server restart, network drop); pg then emits 'error' on the pool, and an
 * EventEmitter without an 'error' listener crashes the process. The pool already discards the broken client,
 * so logging is enough. One JSON line in the shape of the log contract (http-and-env.md §4) with the error
 * code only: driver messages can contain host names, user names, or query fragments.
 */
export function logPoolError(error: unknown): void {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  const line = { level: 'error', time: new Date().toISOString(), event: 'db.pool_error', code };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getDbEnv().DATABASE_URL, max: POOL_MAX });
    pool.on('error', logPoolError);
  }
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
