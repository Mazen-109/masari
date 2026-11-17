// Step 2 of `pnpm test:e2e` (contracts/ci.md §3), run with tsx before Playwright starts: Playwright
// launches `webServer` before `globalSetup`, and the server exits at start-up when its database does not
// exist. Recreates `masari_e2e` (migrations + runtime role) and seeds the demo college into it.
import {
  DEMO_SLUG,
  failureReason,
  getAdminDbEnv,
  recreateDatabase,
  seedDemo,
  withDatabaseName,
} from '@masari/db/admin';
import { E2E_DATABASE } from './constants';

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  await recreateDatabase(env.DATABASE_MIGRATION_URL, env.DATABASE_URL, E2E_DATABASE);
  await seedDemo(withDatabaseName(env.DATABASE_MIGRATION_URL, E2E_DATABASE));
  console.log(`E2E database ready: ${E2E_DATABASE} (college ${DEMO_SLUG})`);
}

main().catch((error: unknown) => {
  console.error(`E2E database preparation failed: ${failureReason(error)}`);
  process.exitCode = 1;
});
