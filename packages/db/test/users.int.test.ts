import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '../src';
import { closeTestPools, makeTenant, makeUser, ownerQuery, pgErrorCode } from './helpers';

// contracts/db-api.md §1.6 `users` (tasks.md T058): lookups by email and id, run as the runtime role.
// Later batches extend this file with the tenant-scoped functions (findInTenant, listInTenant, …).

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
