import { afterAll, describe, expect, it } from 'vitest';
import { countAuditEvents, getUserByEmail } from '../src/admin/test-support';
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
