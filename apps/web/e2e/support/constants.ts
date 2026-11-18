// Shared settings of the end-to-end harness (contracts/ci.md §3). Imported by playwright.config.ts,
// prepare-db.ts, and global-setup.ts so the three agree.

export const E2E_PORT = 3100;

export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Recreated before every run; the name must pass the guard of `recreateDatabase` (masari_e2e…). */
export const E2E_DATABASE = 'masari_e2e';

/** Email capture directory of the e2e server, relative to apps/web (kept apart from local dev mail). */
export const E2E_EMAIL_CAPTURE_DIR = '.tmp/e2e-emails';

/**
 * Hand-over of the demo administrator, relative to apps/web: prepare-db.ts writes the link token of the
 * seed's administrator invitation here (`token`); the first test that needs the administrator accepts it
 * through the screens (`flows.ts` `signInAsDemoAdmin`, guarded by `lock`, then `accepted`) and saves the
 * signed-in cookies (`state.json`) for the others.
 */
export const E2E_DEMO_ADMIN_DIR = '.tmp/e2e-demo-admin';

/**
 * The role-based access college, relative to apps/web: the first test that needs a signed-in role creates
 * one college with an administrator, a faculty member, a Student Affairs member, and a student
 * (`roles.ts`, guarded by `lock`), records them in `accounts.json`, and saves each role's signed-in
 * cookies (`<role>.json`) for the others. Emptied by prepare-db.ts with the database.
 */
export const E2E_ROLES_DIR = '.tmp/e2e-roles';
