// @masari/db/admin — owner connection (contracts/db-api.md §3). Only for packages/db/scripts,
// packages/db/test, and apps/web/e2e; never imported from apps/web/src (ESLint).
export { getAdminDbEnv } from './env';
export { recreateDatabase, withDatabaseName } from './admin/database';
export { applyMigrations, ensureRuntimeRole, runMigrations } from './admin/migrate';
export { connectionTarget } from './admin/identifiers';
export { failureReason, safeFailureReason } from './admin/error-reason';
export {
  createAdminInvitation,
  createTenant,
  createTenantWithAdmin,
  setTenantStatus,
} from './admin/tenants';
export type {
  CreateAdminInvitationResult,
  CreateTenantResult,
  CreateTenantWithAdminResult,
  NewTenantInput,
  NewTenantWithAdminInput,
} from './admin/tenants';
export {
  parseTenantCreateArgs,
  parseTenantSetStatusArgs,
  TENANT_CREATE_USAGE,
  TENANT_SET_STATUS_USAGE,
} from './admin/tenant-args';
export { DEMO_ADMIN_EMAIL, DEMO_COLLEGE, DEMO_SLUG, seedDemo } from './admin/seed';
export type { SeedResult } from './admin/seed';
export {
  addDivision,
  countAuditEvents,
  countSessionsByEmail,
  createStudentProfile,
  getStudentProfileByEmail,
  getUserByEmail,
  resetRateLimits,
} from './admin/test-support';
export type {
  DivisionFixture,
  StudentProfileDetails,
  StudentProfileFixture,
  UserDetails,
} from './admin/test-support';
