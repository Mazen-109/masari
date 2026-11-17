import { defineConfig, devices } from '@playwright/test';
import {
  E2E_BASE_URL,
  E2E_DATABASE,
  E2E_EMAIL_CAPTURE_DIR,
  E2E_PORT,
} from './e2e/support/constants';

// End-to-end harness (contracts/ci.md §3). `pnpm test:e2e` builds, prepares `masari_e2e`
// (e2e/support/prepare-db.ts), then runs Playwright, which starts the production server on port 3100.
const CI = Boolean(process.env.CI);

/** The runtime URL of the environment, pointed at the e2e database. */
function e2eDatabaseUrl(): string {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) {
    throw new Error('DATABASE_URL is not set (copy .env.example to .env at the repository root)');
  }
  const url = new URL(runtimeUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `pnpm start --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      APP_ENV: 'test',
      APP_URL: E2E_BASE_URL,
      DATABASE_URL: e2eDatabaseUrl(),
      EMAIL_TRANSPORT: 'capture',
      EMAIL_CAPTURE_DIR: E2E_EMAIL_CAPTURE_DIR,
      TRUSTED_PROXY_HOPS: '1',
    },
  },
});
