import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabaseName } from '../src/admin/database';
import {
  addDivision,
  countAuditEvents,
  countSessionsByEmail,
  createStudentProfile,
  expireInvitation,
  getStudentProfileByEmail,
  getUserByEmail,
  listAuditEvents,
  listInvitations,
  resetRateLimits,
  setUserStatusByEmail,
} from '../src/admin/test-support';
import { withTenant } from '../src/context';
import { getAdminDbEnv } from '../src/env';
import * as audit from '../src/repositories/audit';
import * as divisions from '../src/repositories/divisions';
import * as invitations from '../src/repositories/invitations';
import * as studentProfiles from '../src/repositories/student-profiles';
import {
  closeTestPools,
  makeTenant,
  makeUser,
  ownerQuery,
  ownerTenantQuery,
  randomSlug,
} from './helpers';

// contracts/db-api.md §3 "Test support": the owner-connection reads used by the e2e tests.

afterAll(closeTestPools);

function migrationUrl(): string {
  return getAdminDbEnv().DATABASE_MIGRATION_URL;
}

describe('getUserByEmail', () => {
  it('returns the summary with the consent time, matching the email case-insensitively', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id, { name: 'Mona Ali', role: 'faculty' });
    const consentAt = new Date('2026-01-02T03:04:05Z');
    await ownerQuery('UPDATE users SET privacy_consent_at = $2 WHERE id = $1', [
      user.id,
      consentAt,
    ]);

    const found = await getUserByEmail(migrationUrl(), `  ${user.email.toUpperCase()} `);
    expect(found).toMatchObject({
      id: user.id,
      tenantId: tenant.id,
      name: 'Mona Ali',
      email: user.email,
      emailVerified: false,
      role: 'faculty',
      status: 'active',
      locale: 'ar',
      privacyConsentAt: consentAt,
    });
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for an unknown email', async () => {
    await expect(
      getUserByEmail(migrationUrl(), `${randomSlug('none')}@example.test`),
    ).resolves.toBe(null);
  });
});

describe('countAuditEvents', () => {
  it('counts the events of one action in one college only', async () => {
    const collegeA = await makeTenant();
    const collegeB = await makeTenant();
    const record = (tenantId: string, action: string) =>
      withTenant({ tenantId, userId: null }, (tx) =>
        audit.record(tx, { actorUserId: null, action, targetType: 'user', targetId: 'x' }),
      );
    await record(collegeA.id, 'user.registered');
    await record(collegeA.id, 'user.registered');
    await record(collegeA.id, 'auth.sign_in');
    await record(collegeB.id, 'user.registered');

    await expect(countAuditEvents(migrationUrl(), collegeA.slug, 'user.registered')).resolves.toBe(
      2,
    );
    await expect(countAuditEvents(migrationUrl(), collegeA.slug, 'auth.sign_in')).resolves.toBe(1);
    await expect(countAuditEvents(migrationUrl(), collegeB.slug, 'auth.sign_in')).resolves.toBe(0);
  });

  it('counts only the events about the given target', async () => {
    const college = await makeTenant();
    const record = (targetId: string) =>
      withTenant({ tenantId: college.id, userId: null }, (tx) =>
        audit.record(tx, {
          actorUserId: null,
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId,
        }),
      );
    await record('first');
    await record('first');
    await record('second');
    const count = (targetId?: string) =>
      countAuditEvents(migrationUrl(), college.slug, 'invitation.revoked', targetId);

    await expect(count('first')).resolves.toBe(2);
    await expect(count('second')).resolves.toBe(1);
    await expect(count('third')).resolves.toBe(0);
    await expect(count()).resolves.toBe(3);
  });

  it('returns 0 for an unknown college', async () => {
    await expect(
      countAuditEvents(migrationUrl(), randomSlug('none'), 'user.registered'),
    ).resolves.toBe(0);
  });
});

describe('listAuditEvents', () => {
  it('lists the actor, target, and metadata of one action in one college, oldest first', async () => {
    const college = await makeTenant();
    const other = await makeTenant();
    const actor = await makeUser(college.id, { role: 'admin' });
    const record = (tenantId: string, targetId: string, fields: string[]) =>
      withTenant({ tenantId, userId: actor.id }, (tx) =>
        audit.record(tx, {
          actorUserId: actor.id,
          action: 'profile.updated',
          targetType: 'student_profile',
          targetId,
          metadata: { fields },
        }),
      );
    await record(college.id, 'first', ['level']);
    await record(college.id, 'second', ['studentCode', 'level']);
    await record(other.id, 'first', ['divisionId']);
    const list = (targetId?: string) =>
      listAuditEvents(migrationUrl(), college.slug, 'profile.updated', targetId);

    await expect(list()).resolves.toEqual([
      { actorUserId: actor.id, targetId: 'first', metadata: { fields: ['level'] } },
      { actorUserId: actor.id, targetId: 'second', metadata: { fields: ['studentCode', 'level'] } },
    ]);
    await expect(list('second')).resolves.toEqual([
      { actorUserId: actor.id, targetId: 'second', metadata: { fields: ['studentCode', 'level'] } },
    ]);
    await expect(listAuditEvents(migrationUrl(), college.slug, 'profile.created')).resolves.toEqual(
      [],
    );
  });

  it('returns an empty list for an unknown college', async () => {
    await expect(
      listAuditEvents(migrationUrl(), randomSlug('none'), 'user.registered'),
    ).resolves.toEqual([]);
  });
});

describe('listInvitations', () => {
  it("lists only that college's invitations, oldest first, with their stored status", async () => {
    const college = await makeTenant();
    const other = await makeTenant();
    const invite = (tenantId: string, email: string) =>
      withTenant({ tenantId, userId: null }, (tx) =>
        invitations.create(tx, { email, role: 'faculty', invitedBy: null }),
      );
    const first = await invite(college.id, `${randomSlug('first')}@example.test`);
    const second = await invite(college.id, `${randomSlug('second')}@example.test`);
    await invite(other.id, `${randomSlug('other')}@example.test`);
    if (!first.ok || !second.ok) throw new Error('listInvitations: not created');
    await ownerTenantQuery(college.id, "UPDATE invitations SET status = 'revoked' WHERE id = $1", [
      second.value.id,
    ]);

    const listed = await listInvitations(migrationUrl(), college.slug);
    expect(listed.map((row) => [row.id, row.role, row.status])).toEqual([
      [first.value.id, 'faculty', 'pending'],
      [second.value.id, 'faculty', 'revoked'],
    ]);
    expect(listed[0]?.expiresAt).toBeInstanceOf(Date);
    expect(listed[0]?.acceptedAt).toBeNull();
  });

  it('returns an empty list for an unknown college', async () => {
    await expect(listInvitations(migrationUrl(), randomSlug('none'))).resolves.toEqual([]);
  });
});

describe('countSessionsByEmail', () => {
  async function addSession(userId: string): Promise<void> {
    await ownerQuery(
      `INSERT INTO sessions (id, expires_at, token, user_id)
       VALUES ($1, now() + interval '1 day', $2, $3)`,
      [`s_${randomBytes(9).toString('hex')}`, randomBytes(16).toString('hex'), userId],
    );
  }

  it("counts only that account's sessions, matching the email case-insensitively", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const other = await makeUser(tenant.id);
    await addSession(user.id);
    await addSession(user.id);
    await addSession(other.id);

    await expect(
      countSessionsByEmail(migrationUrl(), ` ${user.email.toUpperCase()} `),
    ).resolves.toBe(2);
    await expect(countSessionsByEmail(migrationUrl(), other.email)).resolves.toBe(1);
  });

  it('returns 0 for an unknown email', async () => {
    await expect(
      countSessionsByEmail(migrationUrl(), `${randomSlug('none')}@example.test`),
    ).resolves.toBe(0);
  });
});

describe('createStudentProfile', () => {
  async function profileOf(tenantId: string, userId: string) {
    return withTenant({ tenantId, userId: null }, (tx) => studentProfiles.findByUserId(tx, userId));
  }

  it("creates the profile in the account's college, with its first division by default", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const [second, first] = await withTenant({ tenantId: tenant.id, userId: null }, async (tx) => [
      await divisions.create(tx, { code: 'B', nameAr: 'ب', nameEn: 'B', sortOrder: 2 }),
      await divisions.create(tx, { code: 'A', nameAr: 'أ', nameEn: 'A', sortOrder: 1 }),
    ]);
    if (!first?.ok || !second?.ok) throw new Error('divisions not created');

    await createStudentProfile(migrationUrl(), user.email.toUpperCase(), {
      studentCode: 'FIX-1',
    });
    expect(await profileOf(tenant.id, user.id)).toMatchObject({
      tenantId: tenant.id,
      studentCode: 'FIX-1',
      level: 1,
      divisionId: first.value.id,
    });

    const other = await makeUser(tenant.id);
    await createStudentProfile(migrationUrl(), other.email, {
      studentCode: 'FIX-2',
      level: 3,
      divisionCode: 'B',
    });
    expect(await profileOf(tenant.id, other.id)).toMatchObject({
      level: 3,
      divisionId: second.value.id,
    });
  });

  /** Creates the divisions in this order and deactivates those marked inactive; returns their ids. */
  async function addDivisions(
    tenantId: string,
    specs: readonly { code: string; sortOrder: number; isActive: boolean }[],
  ): Promise<string[]> {
    return withTenant({ tenantId, userId: null }, async (tx) => {
      const ids: string[] = [];
      for (const spec of specs) {
        const created = await divisions.create(tx, {
          code: spec.code,
          nameAr: spec.code,
          nameEn: spec.code,
          sortOrder: spec.sortOrder,
        });
        if (!created.ok) throw new Error('division not created');
        if (!spec.isActive) await divisions.setActive(tx, created.value.id, false);
        ids.push(created.value.id);
      }
      return ids;
    });
  }

  it('skips inactive divisions by default, but takes an inactive one named by its code', async () => {
    const tenant = await makeTenant();
    const [inactiveId, activeId] = await addDivisions(tenant.id, [
      { code: 'A', sortOrder: 1, isActive: false },
      { code: 'B', sortOrder: 2, isActive: true },
    ]);

    const user = await makeUser(tenant.id);
    await createStudentProfile(migrationUrl(), user.email, { studentCode: 'FIX-6' });
    expect((await profileOf(tenant.id, user.id))?.divisionId).toBe(activeId);

    const other = await makeUser(tenant.id);
    await createStudentProfile(migrationUrl(), other.email, {
      studentCode: 'FIX-7',
      divisionCode: 'A',
    });
    expect((await profileOf(tenant.id, other.id))?.divisionId).toBe(inactiveId);
  });

  it('throws when no code is given and the college has no active division', async () => {
    const tenant = await makeTenant();
    await addDivisions(tenant.id, [{ code: 'A', sortOrder: 1, isActive: false }]);
    const user = await makeUser(tenant.id);

    await expect(
      createStudentProfile(migrationUrl(), user.email, { studentCode: 'FIX-8' }),
    ).rejects.toThrow(/unknown division/);
    expect(await profileOf(tenant.id, user.id)).toBeNull();
  });

  it('throws for an unknown email or division and writes nothing', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    await expect(
      createStudentProfile(migrationUrl(), `${randomSlug('none')}@example.test`, {
        studentCode: 'FIX-3',
      }),
    ).rejects.toThrow(/unknown account/);
    // The new college has no division at all.
    await expect(
      createStudentProfile(migrationUrl(), user.email, { studentCode: 'FIX-4' }),
    ).rejects.toThrow(/unknown division/);
    expect(await profileOf(tenant.id, user.id)).toBeNull();
  });

  it('refuses a database that is not a throw-away test database', async () => {
    await expect(
      createStudentProfile(withDatabaseName(migrationUrl(), 'masari'), 'x@example.test', {
        studentCode: 'FIX-5',
      }),
    ).rejects.toThrow(/outside a test database/);
  });
});

describe('getStudentProfileByEmail', () => {
  it("returns the account's profile with its division code, matching the email case-insensitively", async () => {
    const tenant = await makeTenant();
    await addDivision(migrationUrl(), tenant.id, { code: 'CS', nameAr: 'حاسب', nameEn: 'CS' });
    const user = await makeUser(tenant.id);
    await createStudentProfile(migrationUrl(), user.email, {
      studentCode: 'FIX-10',
      level: 2,
      divisionCode: 'CS',
    });

    await expect(
      getStudentProfileByEmail(migrationUrl(), ` ${user.email.toUpperCase()} `),
    ).resolves.toEqual({ studentCode: 'FIX-10', level: 2, divisionCode: 'CS' });
  });

  it('returns null for an unknown email or an account without a profile', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    await expect(getStudentProfileByEmail(migrationUrl(), user.email)).resolves.toBeNull();
    await expect(
      getStudentProfileByEmail(migrationUrl(), `${randomSlug('none')}@example.test`),
    ).resolves.toBeNull();
  });
});

describe('addDivision', () => {
  it('adds an active division by default, or an inactive one, to that college only', async () => {
    const tenant = await makeTenant();
    const other = await makeTenant();
    await addDivision(migrationUrl(), tenant.id, {
      code: 'CS',
      nameAr: 'علوم الحاسب',
      nameEn: 'Computer Science',
      sortOrder: 5,
    });
    await addDivision(migrationUrl(), tenant.id, {
      code: 'OLD',
      nameAr: 'قديم',
      nameEn: 'Old',
      isActive: false,
    });

    const all = await withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      divisions.list(tx, { includeInactive: true }),
    );
    expect(
      all.map(({ code, nameEn, sortOrder, isActive }) => ({ code, nameEn, sortOrder, isActive })),
    ).toEqual([
      { code: 'OLD', nameEn: 'Old', sortOrder: 0, isActive: false },
      { code: 'CS', nameEn: 'Computer Science', sortOrder: 5, isActive: true },
    ]);
    const elsewhere = await withTenant({ tenantId: other.id, userId: null }, (tx) =>
      divisions.list(tx, { includeInactive: true }),
    );
    expect(elsewhere).toEqual([]);
  });

  it('refuses a database that is not a throw-away test database', async () => {
    const tenant = await makeTenant();
    await expect(
      addDivision(withDatabaseName(migrationUrl(), 'masari'), tenant.id, {
        code: 'X',
        nameAr: 'س',
        nameEn: 'X',
      }),
    ).rejects.toThrow(/outside a test database/);
  });
});

describe('resetRateLimits', () => {
  async function storedKeys(prefix: string): Promise<string[]> {
    const result = await ownerQuery<{ key: string }>(
      'SELECT key FROM rate_limit_counters WHERE starts_with(key, $1) ORDER BY key',
      [prefix],
    );
    return result.rows.map((row) => row.key);
  }

  it('deletes only the counters with the given key prefix', async () => {
    // Other test files use the table at the same time: this test only touches keys of its own.
    const prefix = `${randomSlug('reset')}:`;
    const neighbour = `${randomSlug('keep')}:`;
    for (const key of [`${prefix}a`, `${prefix}b`, `${neighbour}a`]) {
      await ownerQuery(
        'INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, now(), 1)',
        [key],
      );
    }

    await expect(resetRateLimits(migrationUrl(), prefix)).resolves.toBe(2);
    expect(await storedKeys(prefix)).toEqual([]);
    expect(await storedKeys(neighbour)).toEqual([`${neighbour}a`]);
    await resetRateLimits(migrationUrl(), neighbour);
  });

  it('refuses a database that is not a throw-away test database, before connecting', async () => {
    // Nothing listens on port 1: a connection attempt would fail with a different error.
    const unreachable = 'postgres://owner:owner-pw@127.0.0.1:1/masari';
    await expect(resetRateLimits(unreachable)).rejects.toThrow('outside a test database');
    await expect(resetRateLimits(withDatabaseName(unreachable, 'masari_dev'))).rejects.toThrow(
      'outside a test database',
    );
  });
});

describe('expireInvitation', () => {
  async function inviteIn(tenantId: string, email: string): Promise<string> {
    const result = await withTenant({ tenantId, userId: null }, (tx) =>
      invitations.create(tx, { email, role: 'faculty', invitedBy: null }),
    );
    if (!result.ok) throw new Error('inviteIn: not created');
    return result.value.id;
  }

  async function isExpired(tenantId: string, id: string): Promise<boolean | undefined> {
    const result = await ownerTenantQuery<{ expired: boolean }>(
      tenantId,
      'SELECT expires_at <= now() AS expired FROM invitations WHERE id = $1',
      [id],
    );
    return result.rows[0]?.expired;
  }

  it("expires the email's pending invitations in every college and nothing else", async () => {
    const collegeA = await makeTenant();
    const collegeB = await makeTenant();
    const email = `${randomSlug('expire')}@example.test`;
    const other = `${randomSlug('keep')}@example.test`;
    const inA = await inviteIn(collegeA.id, email);
    const inB = await inviteIn(collegeB.id, email);
    const untouched = await inviteIn(collegeA.id, other);

    await expireInvitation(migrationUrl(), ` ${email.toUpperCase()} `);

    expect(await isExpired(collegeA.id, inA)).toBe(true);
    expect(await isExpired(collegeB.id, inB)).toBe(true);
    expect(await isExpired(collegeA.id, untouched)).toBe(false);
    // Still pending: the list derives "expired", and a new invitation replaces it.
    const listed = await withTenant({ tenantId: collegeA.id, userId: null }, (tx) =>
      invitations.list(tx),
    );
    expect(listed.find((row) => row.id === inA)).toMatchObject({
      status: 'pending',
      displayStatus: 'expired',
    });
  });

  it('throws when the email has no pending invitation', async () => {
    await expect(
      expireInvitation(migrationUrl(), `${randomSlug('none')}@example.test`),
    ).rejects.toThrow('no pending invitation');
  });

  it('refuses a database that is not a throw-away test database, before connecting', async () => {
    const unreachable = 'postgres://owner:owner-pw@127.0.0.1:1/masari';
    await expect(expireInvitation(unreachable, 'a@example.test')).rejects.toThrow(
      'outside a test database',
    );
  });
});

describe('setUserStatusByEmail', () => {
  it('suspends and reactivates the account with this email only', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const neighbour = await makeUser(tenant.id);

    await setUserStatusByEmail(migrationUrl(), ` ${user.email.toUpperCase()} `, 'suspended');
    expect((await getUserByEmail(migrationUrl(), user.email))?.status).toBe('suspended');
    expect((await getUserByEmail(migrationUrl(), neighbour.email))?.status).toBe('active');

    await setUserStatusByEmail(migrationUrl(), user.email, 'active');
    expect((await getUserByEmail(migrationUrl(), user.email))?.status).toBe('active');
  });

  it('throws for an unknown email', async () => {
    await expect(
      setUserStatusByEmail(migrationUrl(), `${randomSlug('none')}@example.test`, 'suspended'),
    ).rejects.toThrow('unknown account');
  });

  it('refuses a database that is not a throw-away test database, before connecting', async () => {
    const unreachable = 'postgres://owner:owner-pw@127.0.0.1:1/masari';
    await expect(setUserStatusByEmail(unreachable, 'a@example.test', 'suspended')).rejects.toThrow(
      'outside a test database',
    );
  });
});
