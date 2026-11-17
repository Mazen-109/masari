// `pnpm db:seed` (contracts/cli.md §3): creates the demo college and its divisions (data-model.md §5).
// Idempotent. Fails closed: runs only when APP_ENV is explicitly development or test, so an unset APP_ENV
// (e.g. a shell pointed at a hosted database without the .env file) never writes demo data.
import { DEMO_SLUG, failureReason, getAdminDbEnv, seedDemo } from '../src/admin';

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test') {
    console.error(
      `Refusing to seed demo data: APP_ENV is ${env.APP_ENV ?? 'not set'}; it must be development or test. Nothing was changed.`,
    );
    process.exitCode = 1;
    return;
  }
  await seedDemo(env.DATABASE_MIGRATION_URL);
  console.log(`Demo college ready: ${DEMO_SLUG}`);
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${failureReason(error)}`);
  process.exitCode = 1;
});
