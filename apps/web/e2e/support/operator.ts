import { randomBytes } from 'node:crypto';
import { createTenantWithAdmin, getAdminDbEnv, withDatabaseName } from '@masari/db/admin';
import { E2E_DATABASE } from './constants';

export { setCollegeStatus } from './db';

// The operator's tools for e2e tests (contracts/cli.md §4–5): the same functions as `pnpm tenant:create`
// and `pnpm tenant:set-status`, against the `masari_e2e` database. A spec that changes college-level data
// does it in a college created here, never in `demo` (contracts/ci.md §3).

function ownerUrl(): string {
  return withDatabaseName(getAdminDbEnv().DATABASE_MIGRATION_URL, E2E_DATABASE);
}

export type OnboardedCollege = {
  tenantId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  /** Locale-less path of the administrator's invitation link: `/invite/<token>`. */
  invitePath: string;
};

/** A slug no other test uses. */
export function uniqueCollegeSlug(prefix = 'onb'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

/**
 * Creates a college (with its `GEN` division) and the first administrator's invitation in one
 * transaction, exactly like `pnpm tenant:create`, and returns the invitation link's path. The names
 * contain the slug, so a test can tell two colleges apart on screen.
 */
export async function createCollege(slug: string, adminEmail: string): Promise<OnboardedCollege> {
  const college = {
    slug,
    nameAr: `كلية التجربة ${slug}`,
    nameEn: `Trial College ${slug}`,
  };
  const result = await createTenantWithAdmin(ownerUrl(), { ...college, adminEmail });
  if (!result.ok) throw new Error(`createCollege: ${result.reason}`);
  return { tenantId: result.tenantId, ...college, invitePath: `/invite/${result.token}` };
}
