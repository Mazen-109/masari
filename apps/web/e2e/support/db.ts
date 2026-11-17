import { randomBytes } from 'node:crypto';
import {
  countAuditEvents as countAuditEventsIn,
  createTenant,
  getAdminDbEnv,
  getUserByEmail as getUserByEmailIn,
  withDatabaseName,
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

export function countAuditEvents(tenantSlug: string, action: string): Promise<number> {
  return countAuditEventsIn(ownerUrl(), tenantSlug, action);
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
