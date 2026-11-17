// `pnpm db:seed` (contracts/cli.md §3): creates the demo college and its divisions (data-model.md §5) and,
// while the college has no administrator, a pending admin invitation whose link is printed once.
// Idempotent. Fails closed: runs only when APP_ENV is explicitly development or test, so an unset APP_ENV
// (e.g. a shell pointed at a hosted database without the .env file) never writes demo data.
import { DEMO_SLUG, getAdminDbEnv, safeFailureReason, seedDemo } from '../src/admin';

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test') {
    console.error(
      `Refusing to seed demo data: APP_ENV is ${env.APP_ENV ?? 'not set'}; it must be development or test. Nothing was changed.`,
    );
    process.exitCode = 1;
    return;
  }
  if (env.APP_URL === undefined) {
    console.error(
      'APP_URL is not set; it is needed for the admin invitation link. Nothing was changed.',
    );
    process.exitCode = 1;
    return;
  }
  const result = await seedDemo(env.DATABASE_MIGRATION_URL);
  console.log(`Demo college ready: ${DEMO_SLUG}`);
  if (result.adminInvitationToken !== null) {
    console.log(`Admin invitation link: ${env.APP_URL}/ar/invite/${result.adminInvitationToken}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${safeFailureReason(error)}`);
  process.exitCode = 1;
});
