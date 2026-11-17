import type pg from 'pg';
import { setTenantContext, withOwnerTransaction } from './owner';

/**
 * College creation for operator tools (contracts/db-api.md §3, data-model.md §5). A new college gets the
 * table defaults (4 levels, every module, no email-domain restriction) and the division `GEN`.
 */

export interface DivisionSeed {
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}

export interface NewTenantInput {
  slug: string;
  nameAr: string;
  nameEn: string;
}

export type CreateTenantResult =
  { ok: true; tenantId: string } | { ok: false; reason: 'slug_taken' };

export const DEFAULT_DIVISION: DivisionSeed = {
  code: 'GEN',
  nameAr: 'عام',
  nameEn: 'General',
  sortOrder: 0,
};

/** Inserts the college; null when the slug is already used (nothing written). */
export async function insertTenant(
  client: pg.Client,
  input: NewTenantInput,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tenants (slug, name_ar, name_en) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [input.slug, input.nameAr, input.nameEn],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Inserts the divisions that do not exist yet into tenantId. Sets the tenant context first: tenant_id comes
 * from the column default app_tenant_id(), and forced RLS checks it against the same setting.
 */
export async function ensureDivisions(
  client: pg.Client,
  tenantId: string,
  rows: readonly DivisionSeed[],
): Promise<void> {
  await setTenantContext(client, tenantId);
  for (const row of rows) {
    await client.query(
      `INSERT INTO divisions (code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [row.code, row.nameAr, row.nameEn, row.sortOrder],
    );
  }
}

/** Creates a college with default settings and the GEN division in one transaction. */
export function createTenant(
  migrationUrl: string,
  input: NewTenantInput,
): Promise<CreateTenantResult> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const tenantId = await insertTenant(client, input);
    if (!tenantId) return { ok: false, reason: 'slug_taken' };
    await ensureDivisions(client, tenantId, [DEFAULT_DIVISION]);
    return { ok: true, tenantId };
  });
}
