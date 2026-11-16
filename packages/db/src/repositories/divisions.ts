import { asc, eq, sql } from 'drizzle-orm';
import type { Division } from '../constants';
import { isUuid, type Tx } from '../context';
import { divisions } from '../schema';

/**
 * Divisions of the college in context (contracts/db-api.md §1.6, data-model.md §3.5). Tenant-scoped: every
 * function runs inside withTenant, and the `tenant_isolation` policy limits it to the current college, so an
 * id from another college behaves exactly like an unknown id.
 */

export type DivisionCreateResult =
  { ok: true; value: Division } | { ok: false; reason: 'code_taken' };

export interface DivisionPatch {
  nameAr?: string;
  nameEn?: string;
  sortOrder?: number;
}

/** Active divisions (or all, with includeInactive), ordered by sort_order then code. */
export async function list(tx: Tx, opts: { includeInactive?: boolean } = {}): Promise<Division[]> {
  return tx
    .select()
    .from(divisions)
    .where(opts.includeInactive ? undefined : eq(divisions.isActive, true))
    .orderBy(asc(divisions.sortOrder), asc(divisions.code));
}

/** null for an unknown id, another college's id, and anything that is not a uuid. */
export async function findById(tx: Tx, id: string): Promise<Division | null> {
  if (!isUuid(id)) return null;
  const rows = await tx.select().from(divisions).where(eq(divisions.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Creates a division in the college in context (tenant_id comes from the column default app_tenant_id()).
 * A duplicate code is detected with ON CONFLICT DO NOTHING rather than a caught unique violation, so the
 * caller's transaction stays usable (e.g. for an audit entry) after `code_taken`.
 */
export async function create(
  tx: Tx,
  input: { code: string; nameAr: string; nameEn: string; sortOrder: number },
): Promise<DivisionCreateResult> {
  const rows = await tx
    .insert(divisions)
    .values({
      code: input.code,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      sortOrder: input.sortOrder,
    })
    .onConflictDoNothing({ target: [divisions.tenantId, divisions.code] })
    .returning();
  const row = rows[0];
  return row ? { ok: true, value: row } : { ok: false, reason: 'code_taken' };
}

async function updateRow(
  tx: Tx,
  id: string,
  values: Partial<Pick<Division, 'nameAr' | 'nameEn' | 'sortOrder' | 'isActive'>>,
): Promise<Division | null> {
  if (!isUuid(id)) return null;
  const rows = await tx
    .update(divisions)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(divisions.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Changes names and order only (the code is immutable); null when the division is not in this college. */
export async function update(tx: Tx, id: string, patch: DivisionPatch): Promise<Division | null> {
  return updateRow(tx, id, {
    nameAr: patch.nameAr,
    nameEn: patch.nameEn,
    sortOrder: patch.sortOrder,
  });
}

/** Activates or deactivates a division; null when the division is not in this college. */
export async function setActive(tx: Tx, id: string, isActive: boolean): Promise<Division | null> {
  return updateRow(tx, id, { isActive });
}
