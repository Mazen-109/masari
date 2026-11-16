// @masari/db/admin — owner connection (contracts/db-api.md §3). Only for packages/db/scripts,
// packages/db/test, and apps/web/e2e; never imported from apps/web/src (ESLint).
export { getAdminDbEnv } from './env';
export { recreateDatabase, withDatabaseName } from './admin/database';
export { applyMigrations, ensureRuntimeRole, runMigrations } from './admin/migrate';
export { connectionTarget } from './admin/identifiers';
