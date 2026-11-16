// `pnpm db:migrate` (contracts/cli.md §2): applies pending migrations with the owner connection, then
// creates/updates the runtime login role named in DATABASE_URL. Idempotent.
import {
  applyMigrations,
  connectionTarget,
  ensureRuntimeRole,
  failureReason,
  getAdminDbEnv,
} from '../src/admin';

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  const applied = await applyMigrations(env.DATABASE_MIGRATION_URL);
  console.log(`Migrations applied: ${applied}`);
  await ensureRuntimeRole(env.DATABASE_MIGRATION_URL, env.DATABASE_URL);
  console.log(`Runtime role ready: ${connectionTarget(env.DATABASE_URL).role}`);
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${failureReason(error)}`);
  process.exitCode = 1;
});
