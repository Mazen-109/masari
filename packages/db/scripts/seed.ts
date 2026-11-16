// `pnpm db:seed` (contracts/cli.md §3): creates the demo college and its divisions (data-model.md §5).
// Idempotent. Refuses to run when APP_ENV=production.
import { DEMO_SLUG, failureReason, getAdminDbEnv, seedDemo } from '../src/admin';

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  if (env.APP_ENV === 'production') {
    console.error('Refusing to seed demo data: APP_ENV is production. Nothing was changed.');
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
