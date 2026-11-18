import { createHash, randomBytes } from 'node:crypto';
import {
  addDivision as addDivisionIn,
  countAuditEvents as countAuditEventsIn,
  countSessionsByEmail as countSessionsByEmailIn,
  createStudentProfile as createStudentProfileIn,
  createTenant,
  DEMO_ADMIN_EMAIL,
  expireInvitation as expireInvitationIn,
  getAdminDbEnv,
  getStudentProfileByEmail as getStudentProfileByEmailIn,
  getUserByEmail as getUserByEmailIn,
  listInvitations as listInvitationsIn,
  resetRateLimits as resetRateLimitsIn,
  setTenantStatus as setTenantStatusIn,
  withDatabaseName,
  type DivisionFixture,
  type InvitationDetails,
  type StudentProfileDetails,
  type StudentProfileFixture,
  type UserDetails,
} from '@masari/db/admin';
import { E2E_DATABASE } from './constants';

// Database reads and fixtures for e2e tests (contracts/db-api.md §3), bound to the owner URL of the
// `masari_e2e` database. Assertions about stored data go through these, never through the web app.

function ownerUrl(): string {
  return withDatabaseName(getAdminDbEnv().DATABASE_MIGRATION_URL, E2E_DATABASE);
}

export function getUserByEmail(email: string): Promise<UserDetails | null> {
  return getUserByEmailIn(ownerUrl(), email);
}

/** Audit events with this action in the college; with `targetId`, only those about that target. */
export function countAuditEvents(
  tenantSlug: string,
  action: string,
  targetId?: string,
): Promise<number> {
  return countAuditEventsIn(ownerUrl(), tenantSlug, action, targetId);
}

/** Every invitation of the college (oldest first), for before/after comparisons of refused actions. */
export function listInvitations(tenantSlug: string): Promise<InvitationDetails[]> {
  return listInvitationsIn(ownerUrl(), tenantSlug);
}

/** Number of sign-in sessions stored for the account with this email (0 when there is none). */
export function countSessions(email: string): Promise<number> {
  return countSessionsByEmailIn(ownerUrl(), email);
}

/**
 * Gives the account an academic profile directly (no screens, no audit row), for signed-in specs that are
 * not about onboarding. Onboarding itself is tested through the screens (registerOnboardedStudent).
 */
export function createStudentProfile(email: string, input: StudentProfileFixture): Promise<void> {
  return createStudentProfileIn(ownerUrl(), email, input);
}

/** The stored academic profile (code, level, division code) of the account with this email, or null. */
export function getStudentProfile(email: string): Promise<StudentProfileDetails | null> {
  return getStudentProfileByEmailIn(ownerUrl(), email);
}

/** Adds a division to the college (no audit row), until the divisions screen exists (PR-36). */
export function addDivision(tenantId: string, input: DivisionFixture): Promise<void> {
  return addDivisionIn(ownerUrl(), tenantId, input);
}

/** Suspends or reactivates a college (as `pnpm tenant:set-status` will); sessions are not touched. */
export async function setCollegeStatus(
  slug: string,
  status: 'active' | 'suspended',
): Promise<void> {
  if ((await setTenantStatusIn(ownerUrl(), slug, status)) !== 'updated') {
    throw new Error('setCollegeStatus: unknown college');
  }
}

/**
 * Empties the rate-limit counters of the e2e database whose key starts with `keyPrefix` (default: all —
 * global setup, so every run starts with fresh buckets). Keys are `"<purpose>:<kind>:<hash>"`, so
 * `'invite-create:'` empties one purpose's buckets.
 */
export async function resetRateLimits(keyPrefix?: string): Promise<void> {
  await resetRateLimitsIn(ownerUrl(), keyPrefix);
}

/**
 * Empties the demo administrator's `invite-create` bucket only (nothing when that account does not exist
 * yet). The key is built like `rateLimitKey` in src/server/rate-limit.ts:
 * `invite-create:user:<sha256 hex of the user id>`.
 */
export async function resetDemoAdminInviteBucket(): Promise<void> {
  const admin = await getUserByEmail(DEMO_ADMIN_EMAIL);
  if (admin === null) return;
  const digest = createHash('sha256').update(admin.id, 'utf8').digest('hex');
  await resetRateLimitsIn(ownerUrl(), `invite-create:user:${digest}`);
}

/** Moves the expiry of the pending invitations for this email into the past (throws when there is none). */
export function expireInvitation(email: string): Promise<void> {
  return expireInvitationIn(ownerUrl(), email);
}

export type College = { tenantId: string; slug: string; nameAr: string; nameEn: string };

/**
 * A new active college of its own (default settings), so a test can count its audit rows without other
 * tests running in parallel. Registration tests must then pass its slug as `?u=`: with more than one
 * active college the registration screen shows a picker.
 */
export async function createCollege(): Promise<College> {
  const suffix = randomBytes(4).toString('hex');
  const college = {
    slug: `e2e-${suffix}`,
    nameAr: `كلية اختبار ${suffix}`,
    nameEn: `Test College ${suffix}`,
  };
  const result = await createTenant(ownerUrl(), college);
  if (!result.ok) throw new Error(`createCollege: ${result.reason}`);
  return { tenantId: result.tenantId, ...college };
}
