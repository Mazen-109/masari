import { recreateDatabase } from '../src/admin/database';
import { getAdminDbEnv } from '../src/env';

const TEST_DATABASE = 'masari_test';

/**
 * Runs once in the main Vitest process, which still sees the configured (development) URLs: drops and
 * recreates `masari_test`, applies migrations, and ensures the runtime role. The development database is
 * only used as the maintenance connection and is never modified.
 */
export default async function setup(): Promise<void> {
  const env = getAdminDbEnv();
  await recreateDatabase(env.DATABASE_MIGRATION_URL, env.DATABASE_URL, TEST_DATABASE);
}
