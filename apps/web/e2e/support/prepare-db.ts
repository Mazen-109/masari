// Step 2 of `pnpm test:e2e` (contracts/ci.md §3), run with tsx before Playwright starts: Playwright
// launches `webServer` before `globalSetup`, and the server exits at start-up when its database does not
// exist. Recreates `masari_e2e` (migrations + runtime role) and seeds the demo college into it, then hands
// the demo administrator's invitation token to the tests (constants.ts `E2E_DEMO_ADMIN_DIR`).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_SLUG,
  failureReason,
  getAdminDbEnv,
  recreateDatabase,
  seedDemo,
  withDatabaseName,
} from '@masari/db/admin';
import { E2E_DATABASE, E2E_DEMO_ADMIN_DIR } from './constants';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Starts the demo administrator's hand-over afresh: the database is new, so any earlier `accepted` marker,
 * lock, or saved session belongs to a database that no longer exists. The token is test-only data of the
 * throw-away e2e database, kept under the git-ignored `.tmp/`.
 */
async function handOverDemoAdmin(token: string | null): Promise<void> {
  const dir = path.resolve(WEB_ROOT, E2E_DEMO_ADMIN_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  if (token === null) throw new Error('the seed created no administrator invitation');
  await writeFile(path.join(dir, 'token'), token, { mode: 0o600 });
}

async function main(): Promise<void> {
  const env = getAdminDbEnv();
  await recreateDatabase(env.DATABASE_MIGRATION_URL, env.DATABASE_URL, E2E_DATABASE);
  const seeded = await seedDemo(withDatabaseName(env.DATABASE_MIGRATION_URL, E2E_DATABASE));
  await handOverDemoAdmin(seeded.adminInvitationToken);
  console.log(`E2E database ready: ${E2E_DATABASE} (college ${DEMO_SLUG})`);
}

main().catch((error: unknown) => {
  console.error(`E2E database preparation failed: ${failureReason(error)}`);
  process.exitCode = 1;
});
