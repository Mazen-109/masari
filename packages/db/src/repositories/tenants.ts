import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import type { Tenant, TenantPublic } from '../constants';
import { isUuid, type Tx } from '../context';
import { tenants } from '../schema';

/**
 * College registry (contracts/db-api.md §1.6). Global table: reads use the pool directly; the only write the
 * runtime role may make is updateSettings, which RLS (`tenants_update`) and the column grants limit to the
 * settings columns of the college in context.
 */

export type TenantSettingsPatch = Partial<
  Pick<Tenant, 'nameAr' | 'nameEn' | 'allowedEmailDomains' | 'levelsCount' | 'enabledModules'>
>;

/** Active colleges for the public picker, ordered by Arabic name. */
export async function listActivePublic(): Promise<TenantPublic[]> {
  return await getDb()
    .select({ id: tenants.id, slug: tenants.slug, nameAr: tenants.nameAr, nameEn: tenants.nameEn })
    .from(tenants)
    .where(eq(tenants.status, 'active'))
    .orderBy(asc(tenants.nameAr), asc(tenants.id));
}

export async function findBySlug(slug: string): Promise<Tenant | null> {
  const rows = await getDb().select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/** null for an unknown id and for anything that is not a uuid (no driver error leaks). */
export async function findById(id: string): Promise<Tenant | null> {
  if (!isUuid(id)) return null;
  const rows = await getDb().select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * The college in context, read in the caller's transaction and locked (FOR UPDATE) until it ends, so two
 * concurrent settings saves are applied one after the other and each compares against the values it
 * replaces. null when the context names no college (RLS `tenants_update` limits the lock to that row).
 */
export async function findCurrentForUpdate(tx: Tx): Promise<Tenant | null> {
  const rows = await tx
    .select()
    .from(tenants)
    .where(sql`${tenants.id} = app_tenant_id()`)
    .for('update');
  return rows[0] ?? null;
}

/**
 * Updates the settings of the college in context and sets updated_at. Only the five settings columns are
 * copied from the patch, so a caller cannot smuggle `slug` or `status` in at run time.
 */
export async function updateSettings(tx: Tx, patch: TenantSettingsPatch): Promise<Tenant> {
  const rows = await tx
    .update(tenants)
    .set({
      nameAr: patch.nameAr,
      nameEn: patch.nameEn,
      allowedEmailDomains: patch.allowedEmailDomains,
      levelsCount: patch.levelsCount,
      enabledModules: patch.enabledModules,
      updatedAt: sql`now()`,
    })
    .where(sql`${tenants.id} = app_tenant_id()`)
    .returning();
  const row = rows[0];
  if (!row) throw new Error('updateSettings: no college in the current tenant context');
  return row;
}
