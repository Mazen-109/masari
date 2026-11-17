import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_EMAIL_CAPTURE_DIR } from './constants';
import { resetRateLimits } from './db';

// Runs after `webServer` has started (contracts/ci.md §3): empties the email capture directory and the
// rate-limit counters, so no bucket filled by an earlier run (also one that reused the database without
// prepare-db.ts) refuses a request of this run. The database itself is prepared earlier by prepare-db.ts.
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup(): Promise<void> {
  const dir = path.resolve(WEB_ROOT, E2E_EMAIL_CAPTURE_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await resetRateLimits();
}
