import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabaseName } from '../src/admin/database';
import {
  countAuditEvents,
  countSessionsByEmail,
  getUserByEmail,
  resetRateLimits,
} from '../src/admin/test-support';
import { withTenant } from '../src/context';
import { getAdminDbEnv } from '../src/env';
import * as audit from '../src/repositories/audit';
import { closeTestPools, makeTenant, makeUser, ownerQuery, randomSlug } from './helpers';

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

  it('returns 0 for an unknown college', async () => {
    await expect(
      countAuditEvents(migrationUrl(), randomSlug('none'), 'user.registered'),
    ).resolves.toBe(0);
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
