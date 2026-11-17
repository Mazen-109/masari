import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '../src';
import { closeTestPools, makeTenant, makeUser, ownerQuery } from './helpers';

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
