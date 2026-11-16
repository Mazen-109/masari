import type pg from 'pg';
import { withOwnerTransaction } from './owner';
import { DEFAULT_DIVISION, ensureDivisions, insertTenant, type DivisionSeed } from './tenants';

/**
 * Demo college for local development and e2e (data-model.md §5, contracts/cli.md §3). Idempotent: an existing
 * demo college and existing divisions are left exactly as they are; only missing rows are added.
 */

export const DEMO_SLUG = 'demo';

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
  /** Link token of a new administrator invitation; always null until invitations exist (PR-26). */
  adminInvitationToken: string | null;
}

export function seedDemo(migrationUrl: string): Promise<SeedResult> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const created = await insertTenant(client, DEMO_COLLEGE);
    const tenantId = created ?? (await findTenantId(client, DEMO_SLUG));
    await ensureDivisions(client, tenantId, DEMO_DIVISIONS);
    return { tenantId, adminInvitationToken: null };
  });
}

async function findTenantId(client: pg.Client, slug: string): Promise<string> {
  const result = await client.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
    slug,
  ]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`seedDemo: college "${slug}" not found after insert`);
  return id;
}
