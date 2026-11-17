import type pg from 'pg';
import { withOwnerTransaction } from './owner';
import {
  DEFAULT_DIVISION,
  ensureDivisions,
  insertAdminInvitation,
  insertTenant,
  type DivisionSeed,
} from './tenants';

/**
 * Demo college for local development and e2e (data-model.md §5, contracts/cli.md §3). Idempotent: an existing
 * demo college and existing divisions are left exactly as they are; only missing rows are added.
 */

export const DEMO_SLUG = 'demo';

/** The demo administrator's invitation address (data-model.md §5); `.test` never receives mail. */
export const DEMO_ADMIN_EMAIL = 'admin@demo.masari.test';

const DEMO_COLLEGE = {
  slug: DEMO_SLUG,
  nameAr: 'كلية الحاسبات والذكاء الاصطناعي (تجريبي)',
  nameEn: 'Faculty of Computers and AI (Demo)',
};

export const DEMO_DIVISIONS: readonly DivisionSeed[] = [
  DEFAULT_DIVISION,
  { code: 'CS', nameAr: 'علوم الحاسب', nameEn: 'Computer Science', sortOrder: 10 },
  { code: 'IS', nameAr: 'نظم المعلومات', nameEn: 'Information Systems', sortOrder: 20 },
  { code: 'IT', nameAr: 'تكنولوجيا المعلومات', nameEn: 'Information Technology', sortOrder: 30 },
  { code: 'AI', nameAr: 'الذكاء الاصطناعي', nameEn: 'Artificial Intelligence', sortOrder: 40 },
];

export interface SeedResult {
  tenantId: string;
  /**
   * Link token of the administrator invitation created by this run; null when nothing was created (the
   * college already has an administrator, a usable invitation is pending, or the address has an account).
   */
  adminInvitationToken: string | null;
}

export function seedDemo(migrationUrl: string): Promise<SeedResult> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const created = await insertTenant(client, DEMO_COLLEGE);
    const tenantId = created ?? (await findTenantId(client, DEMO_SLUG));
    await ensureDivisions(client, tenantId, DEMO_DIVISIONS);
    return { tenantId, adminInvitationToken: await ensureAdminInvitation(client, tenantId) };
  });
}

/** A pending admin invitation for DEMO_ADMIN_EMAIL when the college has no administrator yet. */
async function ensureAdminInvitation(client: pg.Client, tenantId: string): Promise<string | null> {
  const admins = await client.query(
    `SELECT 1 FROM users WHERE tenant_id = $1 AND role = 'admin' LIMIT 1`,
    [tenantId],
  );
  if ((admins.rowCount ?? 0) > 0) return null;
  const invitation = await insertAdminInvitation(client, tenantId, DEMO_ADMIN_EMAIL);
  return invitation.ok ? invitation.token : null;
}

async function findTenantId(client: pg.Client, slug: string): Promise<string> {
  const result = await client.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
    slug,
  ]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`seedDemo: college "${slug}" not found after insert`);
  return id;
}
