// @masari/db/admin — owner connection (contracts/db-api.md §3). Only for packages/db/scripts,
// packages/db/test, and apps/web/e2e; never imported from apps/web/src (ESLint).
export { getAdminDbEnv } from './env';
export { recreateDatabase, withDatabaseName } from './admin/database';
export { applyMigrations, ensureRuntimeRole, runMigrations } from './admin/migrate';
export { connectionTarget } from './admin/identifiers';
export { failureReason } from './admin/error-reason';
export { createTenant } from './admin/tenants';
export type { CreateTenantResult, NewTenantInput } from './admin/tenants';
export { DEMO_SLUG, seedDemo } from './admin/seed';
export type { SeedResult } from './admin/seed';
export { countAuditEvents, getUserByEmail, resetRateLimits } from './admin/test-support';
export type { UserDetails } from './admin/test-support';
