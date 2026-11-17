import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withTenant, type Tx } from '../src/context';
import * as divisions from '../src/repositories/divisions';
import {
  closeTestPools,
  inRuntimeTransaction,
  makeTenant,
  ownerTenantQuery,
  pgErrorCode,
  runtimeQuery,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §4: CRUD; duplicate code per college refused, same code in two colleges allowed;
// college A cannot read/update college B's divisions (by id). Everything runs as the runtime role.

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let collegeA: TenantFixture;
let collegeB: TenantFixture;

beforeEach(async () => {
  collegeA = await makeTenant();
  collegeB = await makeTenant();
});

afterAll(closeTestPools);

function inCollege<T>(college: TenantFixture, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: college.id, userId: null }, fn);
}

async function createOk(
  college: TenantFixture,
  input: { code: string; nameAr?: string; nameEn?: string; sortOrder?: number },
) {
  const result = await inCollege(college, (tx) =>
    divisions.create(tx, {
      code: input.code,
      nameAr: input.nameAr ?? 'شعبة',
      nameEn: input.nameEn ?? 'Division',
      sortOrder: input.sortOrder ?? 0,
    }),
  );
  if (!result.ok) throw new Error(`createOk: ${result.reason}`);
  return result.value;
}

describe('divisions.create', () => {
  it('creates a division in the college in context with the documented defaults', async () => {
    const created = await createOk(collegeA, {
      code: 'CS',
      nameAr: 'علوم الحاسب',
      nameEn: 'Computer Science',
      sortOrder: 10,
    });
    expect(created).toMatchObject({
      tenantId: collegeA.id,
      code: 'CS',
      nameAr: 'علوم الحاسب',
      nameEn: 'Computer Science',
      sortOrder: 10,
      isActive: true,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it('returns code_taken for a duplicate code in one college and keeps the transaction usable', async () => {
    await createOk(collegeA, { code: 'IS' });
    const afterConflict = await inCollege(collegeA, async (tx) => {
      const result = await divisions.create(tx, {
        code: 'IS',
        nameAr: 'مكررة',
        nameEn: 'Duplicate',
        sortOrder: 5,
      });
      return { result, count: (await divisions.list(tx)).length };
    });
    expect(afterConflict).toEqual({ result: { ok: false, reason: 'code_taken' }, count: 1 });
  });

  it('allows the same code in two colleges', async () => {
    const a = await createOk(collegeA, { code: 'AI' });
    const b = await createOk(collegeB, { code: 'AI' });
    expect(a.tenantId).toBe(collegeA.id);
    expect(b.tenantId).toBe(collegeB.id);
    expect(a.id).not.toBe(b.id);
  });

  it.each([
    ['a lower-case code', { code: 'cs' }],
    ['a code longer than 16 characters', { code: 'A'.repeat(17) }],
    ['an empty Arabic name', { code: 'X1', nameAr: '' }],
    ['an English name longer than 80 characters', { code: 'X2', nameEn: 'n'.repeat(81) }],
    ['a sort order above 9999', { code: 'X3', sortOrder: 10_000 }],
    ['a negative sort order', { code: 'X4', sortOrder: -1 }],
  ])('rejects %s (CHECK constraint)', async (_label, input) => {
    expect(await pgErrorCode(createOk(collegeA, input))).toBe('23514');
  });

  it('is refused without a tenant context', async () => {
    const code = await pgErrorCode(
      runtimeQuery(
        `INSERT INTO divisions (code, name_ar, name_en) VALUES ('GEN', 'عام', 'General')`,
      ),
    );
    expect(code).toBe('42501');
  });

  it('refuses an explicit tenant_id of another college (row-level security)', async () => {
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`INSERT INTO divisions (tenant_id, code, name_ar, name_en)
              VALUES (${collegeB.id}::uuid, 'FORGED', 'مزورة', 'Forged')`,
        ),
      ),
    );
    expect(code).toBe('42501');
    expect(
      await inCollege(collegeB, (tx) => divisions.list(tx, { includeInactive: true })),
    ).toEqual([]);
  });
});

describe('divisions.list', () => {
  it('orders by sort_order then code and hides inactive divisions unless asked', async () => {
    const itDivision = await createOk(collegeA, { code: 'IT', sortOrder: 30 });
    const ai = await createOk(collegeA, { code: 'AI', sortOrder: 30 });
    const gen = await createOk(collegeA, { code: 'GEN', sortOrder: 0 });
    const old = await createOk(collegeA, { code: 'OLD', sortOrder: 5 });
    await inCollege(collegeA, (tx) => divisions.setActive(tx, old.id, false));
    await createOk(collegeB, { code: 'BB', sortOrder: 1 });

    const active = await inCollege(collegeA, (tx) => divisions.list(tx));
    expect(active.map((row) => row.id)).toEqual([gen.id, ai.id, itDivision.id]);
    const all = await inCollege(collegeA, (tx) => divisions.list(tx, { includeInactive: true }));
    expect(all.map((row) => row.code)).toEqual(['GEN', 'OLD', 'AI', 'IT']);
  });

  it('returns nothing without a tenant context', async () => {
    await createOk(collegeA, { code: 'GEN' });
    expect((await runtimeQuery('SELECT * FROM divisions')).rowCount).toBe(0);
  });
});

describe('divisions.findById', () => {
  it('finds a division of the college in context', async () => {
    const created = await createOk(collegeA, { code: 'CS' });
    expect(await inCollege(collegeA, (tx) => divisions.findById(tx, created.id))).toEqual(created);
  });

  it("returns null for another college's division, an unknown id, and a non-uuid", async () => {
    const ofB = await createOk(collegeB, { code: 'CS' });
    const found = await inCollege(collegeA, async (tx) => [
      await divisions.findById(tx, ofB.id),
      await divisions.findById(tx, UNKNOWN_ID),
      await divisions.findById(tx, 'not-a-uuid'),
    ]);
    expect(found).toEqual([null, null, null]);
  });
});

describe('divisions.update', () => {
  it('changes names and order, keeps the code, and sets updated_at', async () => {
    const created = await createOk(collegeA, { code: 'CS', sortOrder: 10 });
    const backdated = await ownerTenantQuery<{ updated_at: Date }>(
      collegeA.id,
      `UPDATE divisions SET updated_at = now() - interval '1 day' WHERE id = $1 RETURNING updated_at`,
      [created.id],
    );
    // Without this, a back-dating that matched no row would let the assertion below pass vacuously.
    expect(backdated.rowCount).toBe(1);
    const backdatedAt = backdated.rows[0]?.updated_at.getTime() ?? Number.POSITIVE_INFINITY;
    const updated = await inCollege(collegeA, (tx) =>
      divisions.update(tx, created.id, {
        nameAr: 'علوم الحاسب',
        nameEn: 'Computer Science',
        sortOrder: 20,
      }),
    );
    expect(updated).toMatchObject({
      id: created.id,
      code: 'CS',
      nameAr: 'علوم الحاسب',
      nameEn: 'Computer Science',
      sortOrder: 20,
      isActive: true,
    });
    // Backdated by a day above; the update resets it to the time of the update.
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(backdatedAt);
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('leaves fields missing from the patch unchanged', async () => {
    const created = await createOk(collegeA, {
      code: 'IS',
      nameAr: 'نظم',
      nameEn: 'IS',
      sortOrder: 3,
    });
    const updated = await inCollege(collegeA, (tx) =>
      divisions.update(tx, created.id, { nameEn: 'Information Systems' }),
    );
    expect(updated).toMatchObject({ nameAr: 'نظم', nameEn: 'Information Systems', sortOrder: 3 });
  });

  it("cannot update another college's division by id", async () => {
    const ofB = await createOk(collegeB, { code: 'CS', nameEn: 'Untouched' });
    const results = await inCollege(collegeA, async (tx) => [
      await divisions.update(tx, ofB.id, { nameEn: 'Hijacked' }),
      await divisions.setActive(tx, ofB.id, false),
    ]);
    expect(results).toEqual([null, null]);
    expect(await inCollege(collegeB, (tx) => divisions.findById(tx, ofB.id))).toEqual(ofB);
  });

  it('returns null for an unknown id and a non-uuid', async () => {
    const results = await inCollege(collegeA, async (tx) => [
      await divisions.update(tx, UNKNOWN_ID, { nameEn: 'Ghost' }),
      await divisions.update(tx, 'not-a-uuid', { nameEn: 'Ghost' }),
      await divisions.setActive(tx, 'not-a-uuid', true),
    ]);
    expect(results).toEqual([null, null, null]);
  });
});

describe('divisions.setActive', () => {
  it('deactivates and reactivates a division', async () => {
    const created = await createOk(collegeA, { code: 'IT' });
    const off = await inCollege(collegeA, (tx) => divisions.setActive(tx, created.id, false));
    expect(off).toMatchObject({ id: created.id, isActive: false });
    const on = await inCollege(collegeA, (tx) => divisions.setActive(tx, created.id, true));
    expect(on).toMatchObject({ id: created.id, isActive: true });
  });
});

describe('runtime role limits on divisions', () => {
  it('cannot delete a division, even in its own college', async () => {
    const created = await createOk(collegeA, { code: 'GEN' });
    const code = await pgErrorCode(
      inRuntimeTransaction(async (client) => {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [collegeA.id]);
        return client.query('DELETE FROM divisions WHERE id = $1', [created.id]);
      }),
    );
    expect(code).toBe('42501');
    expect(await inCollege(collegeA, (tx) => divisions.findById(tx, created.id))).toEqual(created);
  });

  it('cannot move a division to another college', async () => {
    const created = await createOk(collegeA, { code: 'CS' });
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`UPDATE divisions SET tenant_id = ${collegeB.id}::uuid WHERE id = ${created.id}::uuid`,
        ),
      ),
    );
    expect(code).toBe('42501');
  });
});
