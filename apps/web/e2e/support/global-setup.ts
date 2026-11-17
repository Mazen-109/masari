import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_EMAIL_CAPTURE_DIR } from './constants';

// Runs after `webServer` has started (contracts/ci.md §3), so it only empties the email capture
// directory; the database is prepared earlier by prepare-db.ts.
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup(): Promise<void> {
  const dir = path.resolve(WEB_ROOT, E2E_EMAIL_CAPTURE_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
