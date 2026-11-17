import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withTenant, type Tx } from '../src/context';
import * as divisions from '../src/repositories/divisions';
import * as studentProfiles from '../src/repositories/student-profiles';
import {
  closeTestPools,
  inRuntimeTransaction,
  makeTenant,
  makeUser,
  ownerTenantQuery,
  pgErrorCode,
  runtimeQuery,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §4: unique code per college (and concurrent creates → exactly one wins); same code in
// two colleges; division from another college → invalid_division; cross-college invisibility;
// maxLevelInUse. Everything runs as the runtime role; fixtures are arranged through the owner connection.

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface College extends TenantFixture {
  divisionId: string;
  otherDivisionId: string;
}

let collegeA: College;
let collegeB: College;

function inCollege<T>(college: TenantFixture, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: college.id, userId: null }, fn);
}

async function makeCollege(): Promise<College> {
  const tenant = await makeTenant();
  const [first, second] = await inCollege(tenant, async (tx) => [
    await divisions.create(tx, { code: 'GEN', nameAr: 'عام', nameEn: 'General', sortOrder: 0 }),
    await divisions.create(tx, { code: 'CS', nameAr: 'علوم الحاسب', nameEn: 'CS', sortOrder: 1 }),
  ]);
  if (!first?.ok || !second?.ok) throw new Error('makeCollege: division not created');
  return { ...tenant, divisionId: first.value.id, otherDivisionId: second.value.id };
}

beforeEach(async () => {
  collegeA = await makeCollege();
  collegeB = await makeCollege();
});

afterAll(closeTestPools);

async function createOk(
  college: College,
  input: { userId?: string; studentCode: string; level?: number; divisionId?: string },
) {
  const userId = input.userId ?? (await makeUser(college.id)).id;
  const result = await inCollege(college, (tx) =>
    studentProfiles.create(tx, {
      userId,
      studentCode: input.studentCode,
      level: input.level ?? 1,
      divisionId: input.divisionId ?? college.divisionId,
    }),
  );
  if (!result.ok) throw new Error(`createOk: ${result.reason}`);
  return result.value;
}

describe('studentProfiles.create', () => {
  it('creates the profile in the college in context', async () => {
    const user = await makeUser(collegeA.id);
    const created = await createOk(collegeA, {
      userId: user.id,
      studentCode: 'CS-2024-001',
      level: 3,
      divisionId: collegeA.otherDivisionId,
    });
    expect(created).toMatchObject({
      userId: user.id,
      tenantId: collegeA.id,
      studentCode: 'CS-2024-001',
      level: 3,
      divisionId: collegeA.otherDivisionId,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(await inCollege(collegeA, (tx) => studentProfiles.findByUserId(tx, user.id))).toEqual(
      created,
    );
  });

  it('returns student_code_taken for a used code in one college and keeps the transaction usable', async () => {
    await createOk(collegeA, { studentCode: '20240001' });
    const other = await makeUser(collegeA.id);
    const outcome = await inCollege(collegeA, async (tx) => {
      const result = await studentProfiles.create(tx, {
        userId: other.id,
        studentCode: '20240001',
        level: 2,
        divisionId: collegeA.divisionId,
      });
      return { result, max: await studentProfiles.maxLevelInUse(tx) };
    });
    expect(outcome).toEqual({ result: { ok: false, reason: 'student_code_taken' }, max: 1 });
    expect(
      await inCollege(collegeA, (tx) => studentProfiles.findByUserId(tx, other.id)),
    ).toBeNull();
  });

  it('lets exactly one of two concurrent creates with the same code win', async () => {
    const [first, second] = [await makeUser(collegeA.id), await makeUser(collegeA.id)];
    // Two separate transactions on two connections, started together.
    const results = await Promise.all(
      [first, second].map((user) =>
        inCollege(collegeA, (tx) =>
          studentProfiles.create(tx, {
            userId: user.id,
            studentCode: 'RACE-01',
            level: 1,
            divisionId: collegeA.divisionId,
          }),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: 'student_code_taken' },
    ]);
    const rows = await ownerTenantQuery(
      collegeA.id,
      `SELECT user_id FROM student_profiles WHERE student_code = 'RACE-01'`,
    );
    expect(rows.rowCount).toBe(1);
  });

  it('allows the same code in two colleges', async () => {
    const a = await createOk(collegeA, { studentCode: 'SHARED-7' });
    const b = await createOk(collegeB, { studentCode: 'SHARED-7' });
    expect(a.tenantId).toBe(collegeA.id);
    expect(b.tenantId).toBe(collegeB.id);
  });

  it('returns already_exists for a second profile of the same user', async () => {
    const user = await makeUser(collegeA.id);
    await createOk(collegeA, { userId: user.id, studentCode: 'ONCE-1' });
    const result = await inCollege(collegeA, (tx) =>
      studentProfiles.create(tx, {
        userId: user.id,
        studentCode: 'ONCE-2',
        level: 2,
        divisionId: collegeA.divisionId,
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'already_exists' });
  });

  it("returns invalid_division for another college's division, an unknown id, and a non-uuid", async () => {
    const user = await makeUser(collegeA.id);
    const results = await inCollege(collegeA, async (tx) => {
      const attempt = (divisionId: string) =>
        studentProfiles.create(tx, { userId: user.id, studentCode: 'DIV-1', level: 1, divisionId });
      return [
        await attempt(collegeB.divisionId),
        await attempt(UNKNOWN_ID),
        await attempt('not-a-uuid'),
      ];
    });
    expect(results).toEqual([
      { ok: false, reason: 'invalid_division' },
      { ok: false, reason: 'invalid_division' },
      { ok: false, reason: 'invalid_division' },
    ]);
    expect(await inCollege(collegeA, (tx) => studentProfiles.findByUserId(tx, user.id))).toBeNull();
  });

  it.each([
    ['a code shorter than 3 characters', { studentCode: 'AB' }],
    ['a code longer than 20 characters', { studentCode: '1'.repeat(21) }],
    ['a code with a space', { studentCode: 'CS 2024' }],
    ['a code with Arabic digits', { studentCode: '٢٠٢٤٠٠١' }],
    ['level 0', { studentCode: 'LVL-0', level: 0 }],
    ['level 8', { studentCode: 'LVL-8', level: 8 }],
  ])('rejects %s (CHECK constraint)', async (_label, input) => {
    expect(await pgErrorCode(createOk(collegeA, input))).toBe('23514');
  });

  it("returns user_not_in_tenant for another college's account and an unknown account", async () => {
    const ofB = await makeUser(collegeB.id);
    const results = await inCollege(collegeA, async (tx) => {
      const attempt = (userId: string) =>
        studentProfiles.create(tx, {
          userId,
          studentCode: 'WRONG-1',
          level: 1,
          divisionId: collegeA.divisionId,
        });
      return [await attempt(ofB.id), await attempt('u_unknown'), await attempt('')];
    });
    expect(results).toEqual([
      { ok: false, reason: 'user_not_in_tenant' },
      { ok: false, reason: 'user_not_in_tenant' },
      { ok: false, reason: 'user_not_in_tenant' },
    ]);
    const rows = await ownerTenantQuery(
      collegeA.id,
      'SELECT 1 FROM student_profiles WHERE user_id = $1',
      [ofB.id],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('never puts the student code in the message of an unexpected database error', async () => {
    const user = await makeUser(collegeA.id);
    const leaky = 'LEAK-CHECK-CODE-TOO-LONG';
    const error: unknown = await inCollege(collegeA, (tx) =>
      studentProfiles.create(tx, {
        userId: user.id,
        studentCode: leaky,
        level: 1,
        divisionId: collegeA.divisionId,
      }),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(studentProfiles.StudentProfileQueryError);
    const wrapped = error as InstanceType<typeof studentProfiles.StudentProfileQueryError>;
    expect(wrapped.name).toBe('StudentProfileQueryError');
    expect(wrapped.code).toBe('23514');
    expect(wrapped.message).not.toContain(leaky);
    expect(wrapped.cause).toBeUndefined();
    expect(String(wrapped.stack)).not.toContain(leaky);
  });

  it('is refused without a tenant context', async () => {
    const user = await makeUser(collegeA.id);
    const code = await pgErrorCode(
      runtimeQuery(
        `INSERT INTO student_profiles (user_id, student_code, level, division_id)
         VALUES ($1, 'NOCTX-1', 1, $2)`,
        [user.id, collegeA.divisionId],
      ),
    );
    expect(code).toBe('42501');
  });

  it('refuses an explicit tenant_id of another college (row-level security)', async () => {
    const user = await makeUser(collegeB.id);
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`INSERT INTO student_profiles (user_id, tenant_id, student_code, level, division_id)
              VALUES (${user.id}, ${collegeB.id}::uuid, 'FORGED-1', 1, ${collegeB.divisionId}::uuid)`,
        ),
      ),
    );
    expect(code).toBe('42501');
    expect(await inCollege(collegeB, (tx) => studentProfiles.findByUserId(tx, user.id))).toBeNull();
  });
});

describe('studentProfiles.findByUserId', () => {
  it("returns null for another college's student and for an unknown user", async () => {
    const ofB = await createOk(collegeB, { studentCode: 'HIDDEN-1' });
    const found = await inCollege(collegeA, async (tx) => [
      await studentProfiles.findByUserId(tx, ofB.userId),
      await studentProfiles.findByUserId(tx, 'u_unknown'),
    ]);
    expect(found).toEqual([null, null]);
  });

  it('sees nothing without a tenant context', async () => {
    await createOk(collegeA, { studentCode: 'NOCTX-2' });
    expect((await runtimeQuery('SELECT * FROM student_profiles')).rowCount).toBe(0);
  });
});

describe('studentProfiles.update', () => {
  it('changes the given fields, leaves the others, and sets updated_at', async () => {
    const created = await createOk(collegeA, { studentCode: 'UPD-1', level: 1 });
    const backdated = await ownerTenantQuery<{ updated_at: Date }>(
      collegeA.id,
      `UPDATE student_profiles SET updated_at = now() - interval '1 day' WHERE user_id = $1
       RETURNING updated_at`,
      [created.userId],
    );
    // Without this, a back-dating that matched no row would let the assertion below pass vacuously.
    expect(backdated.rowCount).toBe(1);
    const backdatedAt = backdated.rows[0]?.updated_at.getTime() ?? Number.POSITIVE_INFINITY;

    const result = await inCollege(collegeA, (tx) =>
      studentProfiles.update(tx, created.userId, {
        level: 4,
        divisionId: collegeA.otherDivisionId,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        userId: created.userId,
        studentCode: 'UPD-1',
        level: 4,
        divisionId: collegeA.otherDivisionId,
      },
    });
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.updatedAt.getTime()).toBeGreaterThan(backdatedAt);

    const recoded = await inCollege(collegeA, (tx) =>
      studentProfiles.update(tx, created.userId, { studentCode: 'UPD-2' }),
    );
    expect(recoded).toMatchObject({ ok: true, value: { studentCode: 'UPD-2', level: 4 } });
  });

  it('returns student_code_taken for a code used in the college and keeps the transaction usable', async () => {
    await createOk(collegeA, { studentCode: 'TAKEN-1' });
    const other = await createOk(collegeA, { studentCode: 'FREE-1' });
    const outcome = await inCollege(collegeA, async (tx) => ({
      result: await studentProfiles.update(tx, other.userId, { studentCode: 'TAKEN-1' }),
      after: await studentProfiles.findByUserId(tx, other.userId),
    }));
    expect(outcome).toEqual({ result: { ok: false, reason: 'student_code_taken' }, after: other });
  });

  it('allows a code that is used only in another college', async () => {
    await createOk(collegeB, { studentCode: 'ELSEWHERE-1' });
    const created = await createOk(collegeA, { studentCode: 'HERE-1' });
    const result = await inCollege(collegeA, (tx) =>
      studentProfiles.update(tx, created.userId, { studentCode: 'ELSEWHERE-1' }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { userId: created.userId, tenantId: collegeA.id, studentCode: 'ELSEWHERE-1' },
    });
  });

  it('writes nothing for an empty patch and answers like findByUserId', async () => {
    const created = await createOk(collegeA, { studentCode: 'EMPTY-1', level: 2 });
    const ofB = await createOk(collegeB, { studentCode: 'EMPTY-2' });
    const results = await inCollege(collegeA, async (tx) => [
      await studentProfiles.update(tx, created.userId, {}),
      await studentProfiles.update(tx, created.userId, {
        studentCode: undefined,
        level: undefined,
        divisionId: undefined,
      }),
      await studentProfiles.update(tx, ofB.userId, {}),
      await studentProfiles.update(tx, 'u_unknown', {}),
    ]);
    expect(results).toEqual([
      { ok: true, value: created },
      { ok: true, value: created },
      { ok: false, reason: 'not_found' },
      { ok: false, reason: 'not_found' },
    ]);
    // updated_at is untouched: the stored row still equals the created one.
    expect(
      await inCollege(collegeA, (tx) => studentProfiles.findByUserId(tx, created.userId)),
    ).toEqual(created);
  });

  it('never puts the student code in the message of an unexpected database error', async () => {
    const created = await createOk(collegeA, { studentCode: 'UPD-LEAK' });
    const leaky = 'has space';
    const error: unknown = await inCollege(collegeA, (tx) =>
      studentProfiles.update(tx, created.userId, { studentCode: leaky }),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(studentProfiles.StudentProfileQueryError);
    const wrapped = error as InstanceType<typeof studentProfiles.StudentProfileQueryError>;
    expect(wrapped.code).toBe('23514');
    expect(wrapped.message).not.toContain(leaky);
    expect(wrapped.cause).toBeUndefined();
  });

  it("returns invalid_division for another college's division and a non-uuid", async () => {
    const created = await createOk(collegeA, { studentCode: 'DIV-2' });
    const results = await inCollege(collegeA, async (tx) => [
      await studentProfiles.update(tx, created.userId, { divisionId: collegeB.divisionId }),
      await studentProfiles.update(tx, created.userId, { divisionId: 'not-a-uuid' }),
    ]);
    expect(results).toEqual([
      { ok: false, reason: 'invalid_division' },
      { ok: false, reason: 'invalid_division' },
    ]);
    expect(
      await inCollege(collegeA, (tx) => studentProfiles.findByUserId(tx, created.userId)),
    ).toEqual(created);
  });

  it("returns not_found for another college's student and an unknown user", async () => {
    const ofB = await createOk(collegeB, { studentCode: 'OTHER-1', level: 2 });
    const results = await inCollege(collegeA, async (tx) => [
      await studentProfiles.update(tx, ofB.userId, { level: 5 }),
      await studentProfiles.update(tx, 'u_unknown', { level: 5 }),
    ]);
    expect(results).toEqual([
      { ok: false, reason: 'not_found' },
      { ok: false, reason: 'not_found' },
    ]);
    expect(await inCollege(collegeB, (tx) => studentProfiles.findByUserId(tx, ofB.userId))).toEqual(
      ofB,
    );
  });
});

describe('studentProfiles.maxLevelInUse', () => {
  it('is 0 without profiles and the highest level of this college only', async () => {
    expect(await inCollege(collegeA, (tx) => studentProfiles.maxLevelInUse(tx))).toBe(0);
    await createOk(collegeA, { studentCode: 'MAX-1', level: 2 });
    await createOk(collegeA, { studentCode: 'MAX-2', level: 4 });
    await createOk(collegeB, { studentCode: 'MAX-3', level: 7 });
    expect(await inCollege(collegeA, (tx) => studentProfiles.maxLevelInUse(tx))).toBe(4);
    expect(await inCollege(collegeB, (tx) => studentProfiles.maxLevelInUse(tx))).toBe(7);
  });
});

describe('runtime role limits on student_profiles', () => {
  it('cannot delete a profile, even in its own college', async () => {
    const created = await createOk(collegeA, { studentCode: 'KEEP-1' });
    const code = await pgErrorCode(
      inRuntimeTransaction(async (client) => {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [collegeA.id]);
        return client.query('DELETE FROM student_profiles WHERE user_id = $1', [created.userId]);
      }),
    );
    expect(code).toBe('42501');
  });

  it('cannot move a profile to another college', async () => {
    const created = await createOk(collegeA, { studentCode: 'MOVE-1' });
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`UPDATE student_profiles SET tenant_id = ${collegeB.id}::uuid
               WHERE user_id = ${created.userId}`,
        ),
      ),
    );
    expect(code).toBe('42501');
  });

  it('deleting the account removes its profile (ON DELETE CASCADE)', async () => {
    const created = await createOk(collegeA, { studentCode: 'GONE-1' });
    const deleted = await runtimeQuery('DELETE FROM users WHERE id = $1', [created.userId]);
    expect(deleted.rowCount).toBe(1);
    const rows = await ownerTenantQuery(
      collegeA.id,
      'SELECT 1 FROM student_profiles WHERE user_id = $1',
      [created.userId],
    );
    expect(rows.rowCount).toBe(0);
  });
});
