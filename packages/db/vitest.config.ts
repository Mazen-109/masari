import { defineConfig } from 'vitest/config';
import { withDatabaseName } from './src/admin/database';

// Integration tests run against a throw-away database (contracts/ci.md §3): the global setup recreates it
// from the configured server, and the test workers connect to it instead of the development database.
const TEST_DATABASE = 'masari_test';

function testDatabaseUrl(url: string | undefined): string | undefined {
  return url ? withDatabaseName(url, TEST_DATABASE) : undefined;
}

const workerEnv = Object.fromEntries(
  Object.entries({
    DATABASE_URL: testDatabaseUrl(process.env.DATABASE_URL),
    DATABASE_MIGRATION_URL: testDatabaseUrl(process.env.DATABASE_MIGRATION_URL),
  }).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: workerEnv,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/schema/**', 'src/admin.ts'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
