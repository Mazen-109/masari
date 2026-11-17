// Shared settings of the end-to-end harness (contracts/ci.md §3). Imported by playwright.config.ts,
// prepare-db.ts, and global-setup.ts so the three agree.

export const E2E_PORT = 3100;

export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Recreated before every run; the name must pass the guard of `recreateDatabase` (masari_e2e…). */
export const E2E_DATABASE = 'masari_e2e';

/** Email capture directory of the e2e server, relative to apps/web (kept apart from local dev mail). */
export const E2E_EMAIL_CAPTURE_DIR = '.tmp/e2e-emails';
