import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { divisions, studentProfiles, users, withTenant, type Tx, type UsersFilter } from '../src';
import { getAdminDbEnv } from '../src/env';
import * as schema from '../src/schema';
import {
  closeTestPools,
  makeTenant,
  makeUser,
  ownerQuery,
  pgErrorCode,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §1.6 `users` and §4 (tasks.md T058, T123), run as the runtime role. users is a global
// table without RLS: every college-scoped function is proven to filter by tenant_id itself — a call naming
// another college's account returns null/false/nothing and changes nothing.

afterAll(closeTestPools);

const SUMMARY_KEYS = [
  'createdAt',
  'email',
  'emailVerified',
  'id',
  'locale',
  'name',
  'role',
  'status',
  'tenantId',
].sort();

function uniqueEmail(): string {
  return `user-${randomBytes(6).toString('hex')}@example.test`;
}

describe('users.findByEmail', () => {
  it('returns the summary of the account with exactly the UserSummary fields', async () => {
    const tenant = await makeTenant();
    const email = uniqueEmail();
    const user = await makeUser(tenant.id, { email, name: 'Mona Ali', role: 'faculty' });
    // A credential account with a password hash exists, but must never be part of the result.
    await ownerQuery(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [`acc_${user.id}`, user.id, 'hash-'.repeat(6)],
    );

    const found = await users.findByEmail(email);

    expect(found).toEqual({
      id: user.id,
      tenantId: tenant.id,
      name: 'Mona Ali',
      email,
      emailVerified: false,
      role: 'faculty',
      status: 'active',
      locale: 'ar',
      createdAt: expect.any(Date) as unknown,
    });
    expect(Object.keys(found ?? {}).sort()).toEqual(SUMMARY_KEYS);
  });

  it('matches regardless of the case and surrounding spaces of the input', async () => {
    const tenant = await makeTenant();
    const email = uniqueEmail();
    const user = await makeUser(tenant.id, { email });

    expect((await users.findByEmail(email.toUpperCase()))?.id).toBe(user.id);
    expect((await users.findByEmail(`  ${email.replace('user', 'USER')} `))?.id).toBe(user.id);
  });

  it('finds accounts in any college, including suspended ones', async () => {
    const tenant = await makeTenant({ status: 'suspended' });
    const email = uniqueEmail();
    const user = await makeUser(tenant.id, { email, status: 'suspended' });

    expect(await users.findByEmail(email)).toMatchObject({
      id: user.id,
      tenantId: tenant.id,
      status: 'suspended',
    });
  });

  it('returns null for an unknown or empty email', async () => {
    expect(await users.findByEmail(uniqueEmail())).toBeNull();
    expect(await users.findByEmail('')).toBeNull();
    expect(await users.findByEmail('   ')).toBeNull();
  });
});

describe('users.findById', () => {
  it('returns the summary of the account and nothing else', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { role: 'admin' });

    const found = await users.findById(user.id);

    expect(found).toMatchObject({
      id: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: 'admin',
    });
    expect(Object.keys(found ?? {}).sort()).toEqual(SUMMARY_KEYS);
  });

  it('returns null for an unknown or empty id', async () => {
    expect(await users.findById(`u_${randomBytes(9).toString('hex')}`)).toBeNull();
    expect(await users.findById('')).toBeNull();
  });
});

describe('users.setLocale', () => {
  it('stores the language of that account only and changes nothing else', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const other = await makeUser(tenant.id);
    const before = await users.findById(user.id);
    expect(before?.locale).toBe('ar');

    await users.setLocale(user.id, 'en');

    expect(await users.findById(user.id)).toEqual({ ...before, locale: 'en' });
    expect((await users.findById(other.id))?.locale).toBe('ar');

    await users.setLocale(user.id, 'ar');
    expect((await users.findById(user.id))?.locale).toBe('ar');
  });

  it('is a no-op for an unknown or empty id', async () => {
    const unknownId = `u_${randomBytes(9).toString('hex')}`;
    await expect(users.setLocale(unknownId, 'en')).resolves.toBeUndefined();
    await expect(users.setLocale('', 'en')).resolves.toBeUndefined();
    expect(await users.findById(unknownId)).toBeNull();
  });
});

describe('users.setName', () => {
  it('changes the name of that account only and nothing else', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { name: 'Mona Ali' });
    const other = await makeUser(tenant.id, { name: 'Omar Said' });
    const before = await users.findById(user.id);

    await users.setName(user.id, 'منى علي');

    expect(await users.findById(user.id)).toEqual({ ...before, name: 'منى علي' });
    expect((await users.findById(other.id))?.name).toBe('Omar Said');
  });

  it('is refused by the database for a name outside 2–100 characters', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { name: 'Mona Ali' });
    expect(await pgErrorCode(users.setName(user.id, 'M'))).toBe('23514');
    expect(await pgErrorCode(users.setName(user.id, 'm'.repeat(101)))).toBe('23514');
    expect((await users.findById(user.id))?.name).toBe('Mona Ali');
  });

  it('is a no-op for an unknown or empty id', async () => {
    const unknownId = `u_${randomBytes(9).toString('hex')}`;
    await expect(users.setName(unknownId, 'Mona Ali')).resolves.toBeUndefined();
    await expect(users.setName('', 'Mona Ali')).resolves.toBeUndefined();
    expect(await users.findById(unknownId)).toBeNull();
  });
});

describe('users.activateInvited', () => {
  it('sets the invited role and confirms the address of that account only', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const other = await makeUser(tenant.id);
    const before = await users.findById(user.id);
    expect(before).toMatchObject({ role: 'student', emailVerified: false });

    await users.activateInvited(tenant.id, user.id, 'faculty');

    expect(await users.findById(user.id)).toEqual({
      ...before,
      role: 'faculty',
      emailVerified: true,
    });
    expect(await users.findById(other.id)).toMatchObject({
      role: 'student',
      emailVerified: false,
    });
  });

  it("throws for another college's account or an unknown id, and changes nothing", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const user = await makeUser(otherCollege.id);
    const before = await users.findById(user.id);
    const unknownId = `u_${randomBytes(9).toString('hex')}`;

    await expect(users.activateInvited(tenant.id, user.id, 'admin')).rejects.toThrow(
      /account not found/,
    );
    await expect(users.activateInvited(tenant.id, unknownId, 'admin')).rejects.toThrow(
      /account not found/,
    );
    await expect(users.activateInvited(tenant.id, '', 'admin')).rejects.toThrow(
      /account not found/,
    );
    await expect(users.activateInvited('not-a-uuid', user.id, 'admin')).rejects.toThrow(
      /account not found/,
    );
    expect(await users.findById(user.id)).toEqual(before);
  });
});

describe('users.deleteJustCreated', () => {
  async function addAccountAndSession(userId: string): Promise<void> {
    await ownerQuery(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [`acc_${userId}`, userId, 'hash-'.repeat(6)],
    );
    await ownerQuery(
      `INSERT INTO sessions (id, expires_at, token, user_id)
       VALUES ($1, now() + interval '1 day', $2, $3)`,
      [`s_${userId}`, randomBytes(16).toString('hex'), userId],
    );
  }

  /** Rows of the account in users, accounts, and sessions. */
  async function rowCounts(userId: string): Promise<number[]> {
    const counts: number[] = [];
    for (const query of [
      'SELECT 1 FROM users WHERE id = $1',
      'SELECT 1 FROM accounts WHERE user_id = $1',
      'SELECT 1 FROM sessions WHERE user_id = $1',
    ]) {
      counts.push((await ownerQuery(query, [userId])).rowCount ?? 0);
    }
    return counts;
  }

  it('deletes a fresh account of that college together with its accounts and sessions', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const neighbour = await makeUser(tenant.id);
    await addAccountAndSession(user.id);
    await addAccountAndSession(neighbour.id);

    expect(await users.deleteJustCreated(tenant.id, user.id)).toBe(true);

    expect(await rowCounts(user.id)).toEqual([0, 0, 0]);
    expect(await rowCounts(neighbour.id)).toEqual([1, 1, 1]);
    expect(await users.deleteJustCreated(tenant.id, user.id)).toBe(false);
  });

  it("refuses another college's account", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const user = await makeUser(otherCollege.id);
    await addAccountAndSession(user.id);

    expect(await users.deleteJustCreated(tenant.id, user.id)).toBe(false);
    expect(await users.deleteJustCreated('not-a-uuid', user.id)).toBe(false);
    expect(await rowCounts(user.id)).toEqual([1, 1, 1]);
  });

  it('refuses an account created more than 10 minutes ago', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    await addAccountAndSession(user.id);
    const aged = await ownerQuery(
      `UPDATE users SET created_at = now() - interval '11 minutes' WHERE id = $1`,
      [user.id],
    );
    expect(aged.rowCount).toBe(1);

    expect(await users.deleteJustCreated(tenant.id, user.id)).toBe(false);
    expect(await rowCounts(user.id)).toEqual([1, 1, 1]);
  });

  it('returns false for an unknown or empty id', async () => {
    const tenant = await makeTenant();
    const unknownId = `u_${randomBytes(9).toString('hex')}`;
    expect(await users.deleteJustCreated(tenant.id, unknownId)).toBe(false);
    expect(await users.deleteJustCreated(tenant.id, '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// College-scoped functions (T123)

const UNKNOWN_TENANT = '00000000-0000-4000-8000-000000000000';
const BACKSLASH = String.fromCharCode(92);

function unknownUserId(): string {
  return `u_${randomBytes(9).toString('hex')}`;
}

function inCollege<T>(college: TenantFixture, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: college.id, userId: null }, fn);
}

/** A division of the college (for student profiles); returns its id. */
async function makeDivision(college: TenantFixture, code = 'GEN'): Promise<string> {
  const result = await inCollege(college, (tx) =>
    divisions.create(tx, { code, nameAr: 'عام', nameEn: 'General', sortOrder: 0 }),
  );
  if (!result.ok) throw new Error('makeDivision: not created');
  return result.value.id;
}

async function makeProfile(
  college: TenantFixture,
  userId: string,
  input: { studentCode: string; level: number; divisionId: string },
): Promise<void> {
  const result = await inCollege(college, (tx) => studentProfiles.create(tx, { userId, ...input }));
  if (!result.ok) throw new Error(`makeProfile: ${result.reason}`);
}

/** Sets created_at to `minutesAgo` minutes before now (list order fixtures). */
async function setCreatedAt(userId: string, minutesAgo: number): Promise<void> {
  const result = await ownerQuery(
    `UPDATE users SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
    [userId, minutesAgo],
  );
  expect(result.rowCount).toBe(1);
}

/** listInTenant inside college's context; `tenantId` defaults to the same college. */
function list(college: TenantFixture, filter: Partial<UsersFilter> = {}, tenantId = college.id) {
  return inCollege(college, (tx) =>
    users.listInTenant(tx, tenantId, { page: 1, pageSize: 20, ...filter }),
  );
}

/** Ids of the rows of one page. */
async function listIds(college: TenantFixture, filter: Partial<UsersFilter> = {}) {
  return (await list(college, filter)).rows.map((row) => row.id);
}

/** An address with a recognisable local part and no `_` (makeUser's default address contains one). */
function plainEmail(local: string): string {
  return `${local}-${randomBytes(4).toString('hex')}@uni.test`;
}

describe('users.findInTenant', () => {
  it('returns the summary of an account of that college', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { role: 'student_affairs' });

    const found = await users.findInTenant(tenant.id, user.id);

    expect(found).toEqual(await users.findById(user.id));
    expect(found).toMatchObject({ id: user.id, tenantId: tenant.id, role: 'student_affairs' });
    expect(Object.keys(found ?? {}).sort()).toEqual(SUMMARY_KEYS);
  });

  it("returns null for another college's account, an unknown or empty id, or another college id", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const stranger = await makeUser(otherCollege.id);
    const own = await makeUser(tenant.id);

    expect(await users.findInTenant(tenant.id, stranger.id)).toBeNull();
    expect(await users.findInTenant(tenant.id, unknownUserId())).toBeNull();
    expect(await users.findInTenant(tenant.id, '')).toBeNull();
    expect(await users.findInTenant('not-a-uuid', own.id)).toBeNull();
    expect(await users.findInTenant(UNKNOWN_TENANT, own.id)).toBeNull();
  });
});

describe('users.lockRoleInTenant', () => {
  it("returns the role of an account of that college, null for another college's or an unknown account", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const own = await makeUser(tenant.id, { role: 'faculty' });
    const stranger = await makeUser(otherCollege.id);

    const roles = await withTenant({ tenantId: tenant.id, userId: null }, async (tx) => [
      await users.lockRoleInTenant(tx, tenant.id, own.id),
      await users.lockRoleInTenant(tx, tenant.id, stranger.id),
      await users.lockRoleInTenant(tx, tenant.id, unknownUserId()),
      await users.lockRoleInTenant(tx, tenant.id, ''),
      await users.lockRoleInTenant(tx, 'not-a-uuid', own.id),
    ]);
    expect(roles).toEqual(['faculty', null, null, null, null]);
  });

  it('holds the account until the transaction ends: a concurrent role change waits', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const order: string[] = [];
    let concurrent: Promise<unknown> = Promise.resolve();
    await withTenant({ tenantId: tenant.id, userId: null }, async (tx) => {
      expect(await users.lockRoleInTenant(tx, tenant.id, user.id)).toBe('student');
      concurrent = users.setRole(tenant.id, user.id, 'faculty').then(() => order.push('setRole'));
      await new Promise((resolve) => setTimeout(resolve, 200));
      order.push('locked');
    });
    await concurrent;
    expect(order).toEqual(['locked', 'setRole']);
    expect((await users.findById(user.id))?.role).toBe('faculty');
  });
});

describe('users.listInTenant', () => {
  it("lists only the college's accounts, newest first, with each student's profile and division", async () => {
    const college = await makeTenant();
    const otherCollege = await makeTenant();
    const divisionId = await makeDivision(college, 'CS');
    const otherDivisionId = await makeDivision(otherCollege, 'CS');

    const student = await makeUser(college.id, { name: 'Sara Student' });
    await makeProfile(college, student.id, { studentCode: 'CS-001', level: 3, divisionId });
    const faculty = await makeUser(college.id, { role: 'faculty' });
    const stranger = await makeUser(otherCollege.id);
    await makeProfile(otherCollege, stranger.id, {
      studentCode: 'CS-001',
      level: 1,
      divisionId: otherDivisionId,
    });
    await setCreatedAt(student.id, 5);
    await setCreatedAt(faculty.id, 1);

    const page = await list(college);

    expect(page.total).toBe(2);
    expect(page.rows).toEqual([
      {
        ...(await users.findById(faculty.id)),
        studentCode: null,
        level: null,
        divisionId: null,
        divisionCode: null,
        divisionNameAr: null,
        divisionNameEn: null,
      },
      {
        ...(await users.findById(student.id)),
        studentCode: 'CS-001',
        level: 3,
        divisionId,
        divisionCode: 'CS',
        divisionNameAr: 'عام',
        divisionNameEn: 'General',
      },
    ]);
    expect(await listIds(otherCollege)).toEqual([stranger.id]);
    // Both colleges have a student with the code CS-001: each search finds its own college's only.
    expect(await list(college, { q: 'cs-001' })).toMatchObject({ total: 1 });
    expect(await listIds(college, { q: 'cs-001' })).toEqual([student.id]);
    expect(await listIds(otherCollege, { q: 'cs-001' })).toEqual([stranger.id]);
  });

  it('orders by created_at descending, then by id', async () => {
    const college = await makeTenant();
    const made: string[] = [];
    for (let index = 0; index < 4; index += 1) made.push((await makeUser(college.id)).id);
    const [a, b, c, d] = made as [string, string, string, string];
    await setCreatedAt(a, 30);
    await setCreatedAt(b, 10);
    await setCreatedAt(c, 20);
    // The same instant as c: the id decides.
    const tied = await ownerQuery(
      `UPDATE users SET created_at = (SELECT created_at FROM users WHERE id = $2) WHERE id = $1`,
      [d, c],
    );
    expect(tied.rowCount).toBe(1);

    expect(await listIds(college)).toEqual([b, ...[c, d].sort(), a]);
  });

  it('searches name, email, and student code, case-insensitively and by part', async () => {
    const college = await makeTenant();
    const divisionId = await makeDivision(college);
    const byName = await makeUser(college.id, { name: 'Mona Hassan', email: plainEmail('m') });
    const byEmail = await makeUser(college.id, { email: plainEmail('zeinab') });
    const byCode = await makeUser(college.id, { name: 'Omar Said', email: plainEmail('o') });
    await makeProfile(college, byCode.id, { studentCode: 'ENG-7731', level: 2, divisionId });
    await makeUser(college.id, { name: 'Unrelated Person', email: plainEmail('u') });

    expect(await listIds(college, { q: 'hass' })).toEqual([byName.id]);
    expect(await listIds(college, { q: 'MONA' })).toEqual([byName.id]);
    expect(await listIds(college, { q: 'ZEINAB-' })).toEqual([byEmail.id]);
    expect(await listIds(college, { q: 'eng-77' })).toEqual([byCode.id]);
    expect(await listIds(college, { q: '  7731 ' })).toEqual([byCode.id]);
    expect((await list(college, { q: '   ' })).total).toBe(4);
    expect(await list(college, { q: 'nobody-matches-this' })).toEqual({ rows: [], total: 0 });
  });

  it('matches %, _ and the backslash literally, not as wildcards', async () => {
    const college = await makeTenant();
    const percent = await makeUser(college.id, {
      name: 'Rate 100% Ali',
      email: plainEmail('rate'),
    });
    const underscore = await makeUser(college.id, {
      name: 'Lina Fares',
      email: `lina_f-${randomBytes(4).toString('hex')}@uni.test`,
    });
    const backslash = await makeUser(college.id, {
      name: `Back${BACKSLASH}Slash`,
      email: plainEmail('back'),
    });
    // As wildcards, `%` and `_` would match these too, and `lina_f` would match `linaxf`.
    await makeUser(college.id, { name: 'Plain Name', email: plainEmail('plain') });
    await makeUser(college.id, { name: 'Linaxf Other', email: plainEmail('linaxf') });

    expect(await listIds(college, { q: '%' })).toEqual([percent.id]);
    expect(await listIds(college, { q: '100%' })).toEqual([percent.id]);
    expect(await listIds(college, { q: '_' })).toEqual([underscore.id]);
    expect(await listIds(college, { q: 'lina_f' })).toEqual([underscore.id]);
    expect(await listIds(college, { q: BACKSLASH })).toEqual([backslash.id]);
    expect((await list(college, { q: '%' })).total).toBe(1);
    expect((await list(college, { q: '_' })).total).toBe(1);
  });

  it('filters by role and status, alone and with a search, and counts only the matches', async () => {
    const college = await makeTenant();
    const otherCollege = await makeTenant();
    const activeStudent = await makeUser(college.id, { name: 'Amal Student' });
    const suspendedStudent = await makeUser(college.id, {
      name: 'Amal Other',
      status: 'suspended',
    });
    const faculty = await makeUser(college.id, { name: 'Amal Faculty', role: 'faculty' });
    const admin = await makeUser(college.id, { name: 'Karim Admin', role: 'admin' });
    await makeUser(otherCollege.id, { name: 'Amal Elsewhere', role: 'faculty' });
    await setCreatedAt(activeStudent.id, 4);
    await setCreatedAt(suspendedStudent.id, 3);
    await setCreatedAt(faculty.id, 2);
    await setCreatedAt(admin.id, 1);

    expect((await list(college, { role: 'student' })).total).toBe(2);
    expect(await listIds(college, { role: 'student' })).toEqual([
      suspendedStudent.id,
      activeStudent.id,
    ]);
    expect(await listIds(college, { status: 'suspended' })).toEqual([suspendedStudent.id]);
    expect(await listIds(college, { role: 'student', status: 'active' })).toEqual([
      activeStudent.id,
    ]);
    expect(await listIds(college, { role: 'faculty', q: 'amal' })).toEqual([faculty.id]);
    expect((await list(college, { q: 'amal' })).total).toBe(3);
    expect((await list(college, { status: 'active' })).total).toBe(3);
    expect(await list(college, { role: 'student_affairs' })).toEqual({ rows: [], total: 0 });
  });

  it('pages: page 2 continues page 1, a page past the end is empty, the total stays', async () => {
    const college = await makeTenant();
    const otherCollege = await makeTenant();
    const ids: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      const user = await makeUser(college.id);
      await setCreatedAt(user.id, index);
      ids.push(user.id);
    }
    await makeUser(otherCollege.id);

    const first = await list(college, { page: 1, pageSize: 20 });
    const second = await list(college, { page: 2, pageSize: 20 });

    expect(first.total).toBe(25);
    expect(second.total).toBe(25);
    expect(first.rows.map((row) => row.id)).toEqual(ids.slice(0, 20));
    expect(second.rows.map((row) => row.id)).toEqual(ids.slice(20));
    expect(await list(college, { page: 3, pageSize: 20 })).toEqual({ rows: [], total: 25 });
    expect(await listIds(college, { page: 3, pageSize: 10 })).toEqual(ids.slice(20));
  });

  it('sends exactly two statements (rows + count) whatever the number of rows', async () => {
    const college = await makeTenant();
    const divisionId = await makeDivision(college);

    /** Statements one listInTenant call sends, counted at the driver inside the transaction. */
    async function statementsFor(filter: Partial<UsersFilter>): Promise<number> {
      const spy = vi.spyOn(pg.Client.prototype, 'query');
      try {
        return await inCollege(college, async (tx) => {
          spy.mockClear();
          await users.listInTenant(tx, college.id, { page: 1, pageSize: 20, ...filter });
          return spy.mock.calls.length;
        });
      } finally {
        spy.mockRestore();
      }
    }

    await makeUser(college.id);
    expect(await statementsFor({})).toBe(2);
    for (let index = 0; index < 12; index += 1) {
      const user = await makeUser(college.id);
      await makeProfile(college, user.id, {
        studentCode: `ST-${index + 100}`,
        level: 1,
        divisionId,
      });
    }
    expect(await statementsFor({})).toBe(2);
    expect(await statementsFor({ q: 'st-1', role: 'student', status: 'active' })).toBe(2);
  });

  it('returns nothing for a college id other than the one in context, or a non-uuid', async () => {
    const college = await makeTenant();
    const otherCollege = await makeTenant();
    await makeUser(college.id);
    await makeUser(otherCollege.id);

    expect(await list(college, {}, otherCollege.id)).toEqual({ rows: [], total: 0 });
    expect(await list(college, {}, UNKNOWN_TENANT)).toEqual({ rows: [], total: 0 });
    expect(await list(college, {}, 'not-a-uuid')).toEqual({ rows: [], total: 0 });
  });

  it("keeps other colleges' profiles and divisions out by the join conditions alone (owner role, RLS bypassed)", async () => {
    const college = await makeTenant();
    const otherCollege = await makeTenant();
    const divisionId = await makeDivision(college, 'CS');
    const otherDivisionId = await makeDivision(otherCollege, 'CS');
    const strayProfile = await makeUser(college.id);
    const strayDivision = await makeUser(college.id);
    await setCreatedAt(strayProfile.id, 5);

    // One owner transaction, always rolled back. The owner is a superuser, so row-level security does not
    // apply: only the conditions written in listInTenant's joins can keep the other college's rows out.
    const client = new pg.Client({ connectionString: getAdminDbEnv().DATABASE_MIGRATION_URL });
    client.on('error', () => undefined);
    await client.connect();
    try {
      await client.query('BEGIN');
      const owner = await client.query<{ superuser: boolean }>(
        `SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`,
      );
      expect(owner.rows[0]?.superuser).toBe(true);
      // Foreign-key triggers off for this transaction only, so the second stray row can exist at all.
      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [college.id]);
      // A profile of the other college for an account of this college (the foreign keys allow it) …
      await client.query(
        `INSERT INTO student_profiles (user_id, tenant_id, student_code, level, division_id)
         VALUES ($1, $2, 'XC-001', 2, $3)`,
        [strayProfile.id, otherCollege.id, otherDivisionId],
      );
      // … and a profile of this college pointing at the other college's division.
      await client.query(
        `INSERT INTO student_profiles (user_id, tenant_id, student_code, level, division_id)
         VALUES ($1, $2, 'CS-002', 3, $3)`,
        [strayDivision.id, college.id, otherDivisionId],
      );
      // Row-level security really is out of the way: both colleges' rows are visible here.
      const visible = await client.query<{ divisions: number; profiles: number }>(
        `SELECT (SELECT count(*)::int FROM divisions WHERE id IN ($1, $2)) AS divisions,
                (SELECT count(*)::int FROM student_profiles WHERE user_id = $3) AS profiles`,
        [divisionId, otherDivisionId, strayProfile.id],
      );
      expect(visible.rows[0]).toEqual({ divisions: 2, profiles: 1 });

      const tx = drizzle({ client, schema }) as unknown as Tx;
      const page = await users.listInTenant(tx, college.id, { page: 1, pageSize: 20 });

      expect(page.total).toBe(2);
      expect(
        page.rows.map(
          ({ id, studentCode, level, divisionCode, divisionNameAr, divisionNameEn }) => ({
            id,
            studentCode,
            level,
            divisionCode,
            divisionNameAr,
            divisionNameEn,
          }),
        ),
      ).toEqual([
        {
          id: strayDivision.id,
          studentCode: 'CS-002',
          level: 3,
          divisionCode: null,
          divisionNameAr: null,
          divisionNameEn: null,
        },
        {
          id: strayProfile.id,
          studentCode: null,
          level: null,
          divisionCode: null,
          divisionNameAr: null,
          divisionNameEn: null,
        },
      ]);
      // The other college's student code is not searchable either (rows and total).
      expect(
        await users.listInTenant(tx, college.id, { q: 'xc-001', page: 1, pageSize: 20 }),
      ).toEqual({ rows: [], total: 0 });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  });

  it('refuses a page or page size that is not a positive integer', async () => {
    const college = await makeTenant();
    for (const filter of [
      { page: 0 },
      { page: -1 },
      { page: 1.5 },
      { page: Number.NaN },
      { pageSize: 0 },
      { pageSize: 101 },
      { pageSize: 2.5 },
    ]) {
      await expect(list(college, filter)).rejects.toThrow(RangeError);
    }
  });

  it('replaces a database error with a UsersQueryError that never quotes the search term', async () => {
    const college = await makeTenant();
    const term = 'secret-term-CS-001';
    const spy = vi.spyOn(pg.Client.prototype, 'query');
    let caught: unknown;
    try {
      await inCollege(college, async (tx) => {
        // The next statement (the page) fails like a cancelled query whose message quotes the parameters.
        spy.mockRejectedValueOnce(
          Object.assign(new Error(`canceling statement; params: %${term}%`), { code: '57014' }),
        );
        await users.listInTenant(tx, college.id, { q: term, page: 1, pageSize: 20 });
      });
    } catch (error) {
      caught = error;
    } finally {
      spy.mockRestore();
    }

    expect(caught).toBeInstanceOf(users.UsersQueryError);
    const error = caught as InstanceType<typeof users.UsersQueryError>;
    expect(error.code).toBe('57014');
    expect(error.message).toBe('users.listInTenant failed (57014)');
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(term);
    expect(String(error.stack)).not.toContain(term);
  });
});

describe('users.setRole', () => {
  it('changes the role of that account only, moves its updated_at, and reports the old and the new role', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { role: 'faculty' });
    const other = await makeUser(tenant.id, { role: 'faculty' });
    // An old stamp, so the change visibly moves it.
    const aged = await ownerQuery(
      `UPDATE users SET updated_at = now() - interval '1 day' WHERE id = ANY($1)`,
      [[user.id, other.id]],
    );
    expect(aged.rowCount).toBe(2);
    const before = await users.findById(user.id);
    const otherBefore = await users.findById(other.id);

    expect(await users.setRole(tenant.id, user.id, 'student_affairs')).toEqual({
      from: 'faculty',
      to: 'student_affairs',
    });

    expect(await users.findById(user.id)).toEqual({ ...before, role: 'student_affairs' });
    expect(await users.findById(other.id)).toEqual(otherBefore);
    const moved = async (id: string) =>
      (
        await ownerQuery<{ moved: boolean }>(
          `SELECT updated_at > now() - interval '1 minute' AS moved FROM users WHERE id = $1`,
          [id],
        )
      ).rows[0]?.moved;
    expect(await moved(user.id)).toBe(true);
    expect(await moved(other.id)).toBe(false);
    expect(await users.setRole(tenant.id, user.id, 'admin')).toEqual({
      from: 'student_affairs',
      to: 'admin',
    });
  });

  it("returns null for another college's account, an unknown id, or a non-uuid college, and changes nothing", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const stranger = await makeUser(otherCollege.id);
    const stored = () =>
      ownerQuery('SELECT role, updated_at FROM users WHERE id = $1', [stranger.id]);
    const before = (await stored()).rows;

    expect(await users.setRole(tenant.id, stranger.id, 'admin')).toBeNull();
    expect(await users.setRole('not-a-uuid', stranger.id, 'admin')).toBeNull();
    expect(await users.setRole(tenant.id, unknownUserId(), 'admin')).toBeNull();
    expect(await users.setRole(tenant.id, '', 'admin')).toBeNull();

    expect((await stored()).rows).toEqual(before);
    expect(before[0]).toMatchObject({ role: 'student' });
  });
});

describe('users.setStatus', () => {
  it('suspends and reactivates that account only', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const other = await makeUser(tenant.id);
    const before = await users.findById(user.id);

    expect(await users.setStatus(tenant.id, user.id, 'suspended')).toBe(true);
    expect(await users.findById(user.id)).toEqual({ ...before, status: 'suspended' });
    expect((await users.findById(other.id))?.status).toBe('active');

    expect(await users.setStatus(tenant.id, user.id, 'active')).toBe(true);
    expect(await users.findById(user.id)).toEqual(before);
  });

  it("returns false for another college's account, an unknown id, or a non-uuid college, and changes nothing", async () => {
    const tenant = await makeTenant();
    const otherCollege = await makeTenant();
    const stranger = await makeUser(otherCollege.id);
    const stored = () =>
      ownerQuery('SELECT status, updated_at FROM users WHERE id = $1', [stranger.id]);
    const before = (await stored()).rows;

    expect(await users.setStatus(tenant.id, stranger.id, 'suspended')).toBe(false);
    expect(await users.setStatus('not-a-uuid', stranger.id, 'suspended')).toBe(false);
    expect(await users.setStatus(tenant.id, unknownUserId(), 'suspended')).toBe(false);
    expect(await users.setStatus(tenant.id, '', 'suspended')).toBe(false);

    expect((await stored()).rows).toEqual(before);
    expect(before[0]).toMatchObject({ status: 'active' });
  });
});
