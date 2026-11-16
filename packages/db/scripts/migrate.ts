// `pnpm db:migrate` (contracts/cli.md §2): applies pending migrations with the owner connection, then
// creates/updates the runtime login role named in DATABASE_URL. Idempotent.
import { applyMigrations, connectionTarget, ensureRuntimeRole, getAdminDbEnv } from '../src/admin';

/** One line, without connection strings (they may contain passwords). */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n')[0] ?? '';
  return firstLine.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>');
}

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  const applied = await applyMigrations(env.DATABASE_MIGRATION_URL);
  console.log(`Migrations applied: ${applied}`);
  await ensureRuntimeRole(env.DATABASE_MIGRATION_URL, env.DATABASE_URL);
  console.log(`Runtime role ready: ${connectionTarget(env.DATABASE_URL).role}`);
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${reason(error)}`);
  process.exitCode = 1;
});
