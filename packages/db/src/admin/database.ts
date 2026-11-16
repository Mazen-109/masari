import pg from 'pg';
import { assertRecreatableDatabase, quoteIdentifier } from './identifiers';
import { ensureRuntimeRole, runMigrations } from './migrate';

/** Returns url with its database name replaced (credentials, host, and query are kept). Pure. */
export function withDatabaseName(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(databaseName)}`;
  return parsed.toString();
}

function databaseOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/**
 * DROP DATABASE IF EXISTS … WITH (FORCE); CREATE DATABASE …; runMigrations; ensureRuntimeRole.
 * The DROP/CREATE run on the database named in migrationUrl (the maintenance connection). Refuses names that
 * do not match /^masari_(test|e2e)[a-z0-9_]*$/ before anything is sent to the server.
 */
export async function recreateDatabase(
  migrationUrl: string,
  runtimeUrl: string,
  databaseName: string,
): Promise<void> {
  const name = quoteIdentifier(assertRecreatableDatabase(databaseName), 'database');
  if (databaseOf(migrationUrl) === databaseName) {
    throw new Error('Refusing to recreate the database used for the maintenance connection');
  }
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
  await runMigrations(withDatabaseName(migrationUrl, databaseName));
  await ensureRuntimeRole(
    withDatabaseName(migrationUrl, databaseName),
    withDatabaseName(runtimeUrl, databaseName),
  );
}
