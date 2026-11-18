import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ADMIN_EMAIL, DEMO_SLUG, seedDemo } from '../src/admin/seed';
import {
  createAdminInvitation,
  createTenant,
  createTenantWithAdmin,
  setTenantStatus,
} from '../src/admin/tenants';
import { withDatabaseName } from '../src/admin/database';
import { withTenant } from '../src/context';
import { getAdminDbEnv } from '../src/env';
import * as divisions from '../src/repositories/divisions';
import { hashInvitationToken } from '../src/tokens';
import {
  closeTestPools,
  makeTenant,
  makeUser,
  ownerQuery,
  ownerTenantQuery,
  randomSlug,
} from './helpers';

// contracts/db-api.md §4: createTenant defaults + GEN division; duplicate slug; createAdminInvitation;
// createTenantWithAdmin is atomic; setTenantStatus leaves session rows in place; seedDemo is idempotent and
// ensures the demo admin invitation; `pnpm db:seed` twice leaves one demo college with five divisions and
// prints the invitation link only when it created one. Tenant-scoped
// rows are written with the tenant context set, so creation also works for a hosted owner role that is not a
// superuser and is therefore subject to the forced RLS of `divisions` (proved with a scratch role below).

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const NON_SUPERUSER_OWNER = 'masari_test_admin_owner';
const SCRATCH_ROLE_LIFETIME_MS = 15 * 60_000;
const ALL_MODULES = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'];
const run = promisify(execFile);
const APP_URL = 'http://localhost:3000';
const DAY_MS = 24 * 60 * 60 * 1000;

function migrationUrl(): string {
  return getAdminDbEnv().DATABASE_MIGRATION_URL;
}

async function divisionCodes(tenantId: string): Promise<string[]> {
  const rows = await withTenant({ tenantId, userId: null }, (tx) =>
    divisions.list(tx, { includeInactive: true }),
  );
  return rows.map((row) => row.code);
}

async function countTenants(slug: string): Promise<number> {
  const result = await ownerQuery<{ count: number }>(
    'SELECT count(*)::int AS count FROM tenants WHERE slug = $1',
    [slug],
  );
  return result.rows[0]?.count ?? 0;
}

afterAll(closeTestPools);

interface StoredInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string | null;
  expires_at: Date;
  created_at: Date;
}

/** The invitation whose token hash matches this token, read as the owner in its college. */
async function invitationByToken(
  tenantId: string,
  token: string,
): Promise<StoredInvitation | undefined> {
  const result = await ownerTenantQuery<StoredInvitation>(
    tenantId,
    `SELECT id, email, role, status, invited_by, expires_at, created_at
       FROM invitations WHERE token_hash = $1`,
    [hashInvitationToken(token)],
  );
  return result.rows[0];
}

async function invitationAudit(tenantId: string, invitationId: string): Promise<unknown[]> {
  const result = await ownerTenantQuery(
    tenantId,
    `SELECT actor_user_id, target_type, metadata FROM audit_events
      WHERE action = 'invitation.created' AND target_id = $1`,
    [invitationId],
  );
  return result.rows;
}

async function countInvitations(tenantId: string, email: string): Promise<number> {
  const result = await ownerTenantQuery<{ count: number }>(
    tenantId,
    'SELECT count(*)::int AS count FROM invitations WHERE tenant_id = $1 AND email = $2',
    [tenantId, email],
  );
  return result.rows[0]?.count ?? 0;
}

function adminEmail(): string {
  return `admin-${randomBytes(6).toString('hex')}@example.test`;
}

const OPERATOR_AUDIT = [
  { actor_user_id: null, target_type: 'invitation', metadata: { role: 'admin' } },
];

describe('createTenant', () => {
  it('creates an active college with default settings and the GEN division', async () => {
    const slug = randomSlug('new');
    const result = await createTenant(migrationUrl(), {
      slug,
      nameAr: 'كلية جديدة',
      nameEn: 'New College',
    });
    if (!result.ok) throw new Error(`createTenant: ${result.reason}`);

    const tenant = await ownerQuery(
      `SELECT slug, name_ar, name_en, status, allowed_email_domains, levels_count, enabled_modules
         FROM tenants WHERE id = $1`,
      [result.tenantId],
    );
    expect(tenant.rows).toEqual([
      {
        slug,
        name_ar: 'كلية جديدة',
        name_en: 'New College',
        status: 'active',
        allowed_email_domains: [],
        levels_count: 4,
        enabled_modules: ALL_MODULES,
      },
    ]);

    const rows = await withTenant({ tenantId: result.tenantId, userId: null }, (tx) =>
      divisions.list(tx, { includeInactive: true }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: result.tenantId,
        code: 'GEN',
        nameAr: 'عام',
        nameEn: 'General',
        sortOrder: 0,
        isActive: true,
      }),
    ]);
  });

  it('returns slug_taken for a used slug and changes nothing', async () => {
    const slug = randomSlug('dup');
    const first = await createTenant(migrationUrl(), { slug, nameAr: 'أ', nameEn: 'A' });
    if (!first.ok) throw new Error('first createTenant failed');

    const second = await createTenant(migrationUrl(), { slug, nameAr: 'ب', nameEn: 'B' });
    expect(second).toEqual({ ok: false, reason: 'slug_taken' });
    expect(await countTenants(slug)).toBe(1);
    const names = await ownerQuery('SELECT name_en FROM tenants WHERE slug = $1', [slug]);
    expect(names.rows).toEqual([{ name_en: 'A' }]);
    expect(await divisionCodes(first.tenantId)).toEqual(['GEN']);
  });

  it('rolls back and throws on invalid input, leaving nothing behind', async () => {
    const slug = 'Not A Slug';
    await expect(
      createTenant(migrationUrl(), { slug, nameAr: 'أ', nameEn: 'A' }),
    ).rejects.toThrow();
    expect(await countTenants(slug)).toBe(0);
  });
});

describe('createTenant under a non-superuser owner (forced RLS applies)', () => {
  let scratchUrl: string;

  beforeAll(async () => {
    const password = randomBytes(18).toString('hex');
    const owner = await ownerQuery<{ name: string }>('SELECT quote_ident(current_user) AS name');
    await ownerQuery(`DROP ROLE IF EXISTS ${NON_SUPERUSER_OWNER}`);
    // A hosted owner: not superuser, no BYPASSRLS, but a member of the role that owns every table — so it
    // is treated as the table owner, which bypasses the non-forced RLS of `tenants` but not the forced RLS
    // of `divisions`. The membership grants inherited privileges only (no SET ROLE to the owner), and the
    // login expires soon and allows two connections, so a role left behind by an aborted run is harmless.
    const validUntil = new Date(Date.now() + SCRATCH_ROLE_LIFETIME_MS).toISOString();
    await ownerQuery(
      `CREATE ROLE ${NON_SUPERUSER_OWNER} LOGIN NOSUPERUSER NOBYPASSRLS INHERIT CONNECTION LIMIT 2
         PASSWORD '${password}' VALID UNTIL '${validUntil}'`,
    );
    await ownerQuery(
      `GRANT ${owner.rows[0]?.name ?? 'missing_owner'} TO ${NON_SUPERUSER_OWNER}
         WITH INHERIT TRUE, SET FALSE`,
    );
    const url = new URL(migrationUrl());
    url.username = NON_SUPERUSER_OWNER;
    url.password = password;
    scratchUrl = url.toString();
  });

  afterAll(async () => {
    await ownerQuery(`DROP ROLE IF EXISTS ${NON_SUPERUSER_OWNER}`);
  });

  it('is really subject to forced RLS on divisions', async () => {
    const tenant = await createTenant(migrationUrl(), {
      slug: randomSlug('rls'),
      nameAr: 'أ',
      nameEn: 'A',
    });
    if (!tenant.ok) throw new Error('createTenant failed');
    const client = new pg.Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
      );
      expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
      // Without app.tenant_id the policy refuses even an explicit tenant_id (42501 = RLS violation; the
      // message tells it apart from a missing grant, which has the same code).
      const failure = await client
        .query(
          `INSERT INTO divisions (tenant_id, code, name_ar, name_en) VALUES ($1, 'X', 'س', 'X')`,
          [tenant.tenantId],
        )
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({ code: '42501' });
      expect((failure as Error).message).toMatch(/row-level security/);
    } finally {
      await client.end();
    }
  });

  it('creates the college and its GEN division because the tenant context is set', async () => {
    const result = await createTenant(scratchUrl, {
      slug: randomSlug('hosted'),
      nameAr: 'كلية مستضافة',
      nameEn: 'Hosted College',
    });
    if (!result.ok) throw new Error(`createTenant: ${result.reason}`);
    expect(await divisionCodes(result.tenantId)).toEqual(['GEN']);
  });

  it('creates the college, GEN division, and admin invitation in one call', async () => {
    const result = await createTenantWithAdmin(scratchUrl, {
      slug: randomSlug('hosted'),
      nameAr: 'كلية مستضافة',
      nameEn: 'Hosted College',
      adminEmail: adminEmail(),
    });
    if (!result.ok) throw new Error(`createTenantWithAdmin: ${result.reason}`);
    expect(await divisionCodes(result.tenantId)).toEqual(['GEN']);
    const invitation = await invitationByToken(result.tenantId, result.token);
    expect(invitation).toMatchObject({ role: 'admin', status: 'pending' });
    expect(await invitationAudit(result.tenantId, invitation?.id ?? '')).toEqual(OPERATOR_AUDIT);
  });

  it('seeds the demo college under the same role, idempotently', async () => {
    const first = await seedDemo(scratchUrl);
    expect(await divisionCodes(first.tenantId)).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
    const second = await seedDemo(scratchUrl);
    expect(second).toMatchObject({ tenantId: first.tenantId, adminInvitationToken: null });
    expect(await divisionCodes(second.tenantId)).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
    expect(await countTenants(DEMO_SLUG)).toBe(1);
  });
});

describe('createAdminInvitation', () => {
  it('creates a pending 7-day admin invitation by the operator, audited with a NULL actor', async () => {
    const tenant = await makeTenant();
    const email = adminEmail();
    const result = await createAdminInvitation(
      migrationUrl(),
      tenant.id,
      ` ${email.toUpperCase()} `,
    );
    if (!result.ok) throw new Error(`createAdminInvitation: ${result.reason}`);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const invitation = await invitationByToken(tenant.id, result.token);
    expect(invitation).toMatchObject({ email, role: 'admin', status: 'pending', invited_by: null });
    const validity =
      (invitation?.expires_at.getTime() ?? 0) - (invitation?.created_at.getTime() ?? 0);
    expect(Math.abs(validity - 7 * DAY_MS)).toBeLessThan(1000);
    expect(await invitationAudit(tenant.id, invitation?.id ?? '')).toEqual(OPERATOR_AUDIT);
  });

  it('answers pending_exists for a second invitation to the same email and writes nothing', async () => {
    const tenant = await makeTenant();
    const email = adminEmail();
    const first = await createAdminInvitation(migrationUrl(), tenant.id, email);
    expect(first.ok).toBe(true);
    await expect(createAdminInvitation(migrationUrl(), tenant.id, email)).resolves.toEqual({
      ok: false,
      reason: 'pending_exists',
    });
    expect(await countInvitations(tenant.id, email)).toBe(1);
  });

  it("revokes an expired pending invitation only in its own college, never in another one's", async () => {
    // Runs under the default owner connection — a superuser locally and in CI, which bypasses RLS — so only
    // the explicit tenant_id filter keeps college B's invitation out of reach. The precondition is
    // asserted, so that the test cannot pass vacuously under an owner that RLS would already restrict.
    const role = await ownerQuery<{ rolsuper: boolean }>(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    expect(role.rows).toEqual([{ rolsuper: true }]);
    const collegeA = await makeTenant();
    const collegeB = await makeTenant();
    const email = adminEmail();
    const inB = await createAdminInvitation(migrationUrl(), collegeB.id, email);
    if (!inB.ok) throw new Error(`createAdminInvitation: ${inB.reason}`);
    const expired = await ownerTenantQuery(
      collegeB.id,
      `UPDATE invitations SET expires_at = now() - interval '1 minute'
        WHERE tenant_id = $1 AND email = $2`,
      [collegeB.id, email],
    );
    expect(expired.rowCount).toBe(1);

    const inA = await createAdminInvitation(migrationUrl(), collegeA.id, email);
    expect(inA.ok).toBe(true);
    expect((await invitationByToken(collegeB.id, inB.token))?.status).toBe('pending');
    expect(await countInvitations(collegeA.id, email)).toBe(1);
  });

  it('revokes an expired pending invitation for the same email in the same college', async () => {
    const tenant = await makeTenant();
    const email = adminEmail();
    const old = await createAdminInvitation(migrationUrl(), tenant.id, email);
    if (!old.ok) throw new Error(`createAdminInvitation: ${old.reason}`);
    await ownerTenantQuery(
      tenant.id,
      `UPDATE invitations SET expires_at = now() - interval '1 minute'
        WHERE tenant_id = $1 AND email = $2`,
      [tenant.id, email],
    );
    const fresh = await createAdminInvitation(migrationUrl(), tenant.id, email);
    expect(fresh.ok).toBe(true);
    expect((await invitationByToken(tenant.id, old.token))?.status).toBe('revoked');
  });

  it('answers email_has_account when the email has an account in any college', async () => {
    const tenant = await makeTenant();
    const elsewhere = await makeTenant();
    const user = await makeUser(elsewhere.id);
    await expect(createAdminInvitation(migrationUrl(), tenant.id, user.email)).resolves.toEqual({
      ok: false,
      reason: 'email_has_account',
    });
    expect(await countInvitations(tenant.id, user.email)).toBe(0);
  });
});

describe('createTenantWithAdmin', () => {
  it('creates an active college, its GEN division, and a pending admin invitation', async () => {
    const slug = randomSlug('full');
    const email = adminEmail();
    const result = await createTenantWithAdmin(migrationUrl(), {
      slug,
      nameAr: 'كلية كاملة',
      nameEn: 'Full College',
      adminEmail: email,
    });
    if (!result.ok) throw new Error(`createTenantWithAdmin: ${result.reason}`);
    expect(await countTenants(slug)).toBe(1);
    expect(await divisionCodes(result.tenantId)).toEqual(['GEN']);
    const invitation = await invitationByToken(result.tenantId, result.token);
    expect(invitation).toMatchObject({ email, role: 'admin', status: 'pending', invited_by: null });
    expect(await invitationAudit(result.tenantId, invitation?.id ?? '')).toEqual(OPERATOR_AUDIT);
  });

  it('answers slug_taken and changes nothing', async () => {
    const existing = await makeTenant();
    const email = adminEmail();
    await expect(
      createTenantWithAdmin(migrationUrl(), {
        slug: existing.slug,
        nameAr: 'أ',
        nameEn: 'A',
        adminEmail: email,
      }),
    ).resolves.toEqual({ ok: false, reason: 'slug_taken' });
    expect(await countTenants(existing.slug)).toBe(1);
    expect(await countInvitations(existing.id, email)).toBe(0);
  });

  // Divisions and invitations reference their college (FK, ON DELETE RESTRICT): without the college row,
  // none of its divisions or invitations can exist.
  it('creates no college (hence no division) for an email that has an account', async () => {
    const elsewhere = await makeTenant();
    const user = await makeUser(elsewhere.id);
    const slug = randomSlug('taken');
    await expect(
      createTenantWithAdmin(migrationUrl(), {
        slug,
        nameAr: 'أ',
        nameEn: 'A',
        adminEmail: user.email,
      }),
    ).resolves.toEqual({ ok: false, reason: 'email_has_account' });
    expect(await countTenants(slug)).toBe(0);
  });

  it('leaves nothing behind when the invitation step fails after the college was inserted', async () => {
    const suffix = randomBytes(6).toString('hex');
    const email = `fail-${suffix}@example.test`;
    const fn = `masari_test_fail_invitation_${suffix}`;
    // A scratch trigger that fails only for this email, so parallel test files are unaffected.
    await ownerQuery(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $body$
       BEGIN
         IF NEW.email = '${email}' THEN RAISE EXCEPTION 'forced failure'; END IF;
         RETURN NEW;
       END $body$`,
    );
    await ownerQuery(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON invitations FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    try {
      const slug = randomSlug('boom');
      await expect(
        createTenantWithAdmin(migrationUrl(), {
          slug,
          nameAr: 'أ',
          nameEn: 'A',
          adminEmail: email,
        }),
      ).rejects.toThrow(/forced failure/);
      expect(await countTenants(slug)).toBe(0);
    } finally {
      await ownerQuery(`DROP TRIGGER IF EXISTS ${fn} ON invitations`);
      await ownerQuery(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
});

describe('setTenantStatus', () => {
  async function statusOf(slug: string): Promise<string | undefined> {
    const result = await ownerQuery<{ status: string }>(
      'SELECT status FROM tenants WHERE slug = $1',
      [slug],
    );
    return result.rows[0]?.status;
  }

  it('suspends and reactivates a college and leaves its session rows in place', async () => {
    const tenant = await makeTenant();
    const other = await makeTenant();
    const user = await makeUser(tenant.id);
    const sessionId = `s_${randomBytes(9).toString('hex')}`;
    await ownerQuery(
      `INSERT INTO sessions (id, expires_at, token, user_id)
       VALUES ($1, now() + interval '1 day', $2, $3)`,
      [sessionId, randomBytes(16).toString('hex'), user.id],
    );

    await expect(setTenantStatus(migrationUrl(), tenant.slug, 'suspended')).resolves.toBe(
      'updated',
    );
    expect(await statusOf(tenant.slug)).toBe('suspended');
    expect(await statusOf(other.slug)).toBe('active');
    const left = await ownerQuery('SELECT 1 FROM sessions WHERE id = $1', [sessionId]);
    expect(left.rowCount).toBe(1);

    await expect(setTenantStatus(migrationUrl(), tenant.slug, 'active')).resolves.toBe('updated');
    expect(await statusOf(tenant.slug)).toBe('active');
  });

  it('answers not_found for an unknown slug', async () => {
    await expect(setTenantStatus(migrationUrl(), randomSlug('none'), 'suspended')).resolves.toBe(
      'not_found',
    );
  });
});

/** Revokes the demo college's pending invitations, so that the next seed creates a fresh one. */
async function revokeDemoInvitations(): Promise<string> {
  const { tenantId } = await seedDemo(migrationUrl());
  await ownerTenantQuery(
    tenantId,
    `UPDATE invitations SET status = 'revoked' WHERE tenant_id = $1 AND status = 'pending'`,
    [tenantId],
  );
  return tenantId;
}

describe('seedDemo', () => {
  it('is idempotent: five divisions and one pending admin invitation, created once', async () => {
    await revokeDemoInvitations();
    const first = await seedDemo(migrationUrl());
    const second = await seedDemo(migrationUrl());
    // The first run's invitation is still usable: nothing new, and the caller can say so.
    expect(second).toEqual({
      tenantId: first.tenantId,
      adminInvitationToken: null,
      adminInvitationPending: true,
    });
    expect(await countTenants(DEMO_SLUG)).toBe(1);

    const token = first.adminInvitationToken;
    if (token === null) throw new Error('seedDemo created no admin invitation');
    const invitation = await invitationByToken(first.tenantId, token);
    expect(invitation).toMatchObject({
      email: DEMO_ADMIN_EMAIL,
      role: 'admin',
      status: 'pending',
      invited_by: null,
    });
    expect(await invitationAudit(first.tenantId, invitation?.id ?? '')).toEqual(OPERATOR_AUDIT);

    const rows = await withTenant({ tenantId: first.tenantId, userId: null }, (tx) =>
      divisions.list(tx, { includeInactive: true }),
    );
    expect(
      rows.map(({ code, nameAr, nameEn, sortOrder }) => ({ code, nameAr, nameEn, sortOrder })),
    ).toEqual([
      { code: 'GEN', nameAr: 'عام', nameEn: 'General', sortOrder: 0 },
      { code: 'CS', nameAr: 'علوم الحاسب', nameEn: 'Computer Science', sortOrder: 10 },
      { code: 'IS', nameAr: 'نظم المعلومات', nameEn: 'Information Systems', sortOrder: 20 },
      {
        code: 'IT',
        nameAr: 'تكنولوجيا المعلومات',
        nameEn: 'Information Technology',
        sortOrder: 30,
      },
      { code: 'AI', nameAr: 'الذكاء الاصطناعي', nameEn: 'Artificial Intelligence', sortOrder: 40 },
    ]);
    const tenant = await ownerQuery('SELECT name_ar, name_en FROM tenants WHERE id = $1', [
      first.tenantId,
    ]);
    expect(tenant.rows).toEqual([
      {
        name_ar: 'كلية الحاسبات والذكاء الاصطناعي (تجريبي)',
        name_en: 'Faculty of Computers and AI (Demo)',
      },
    ]);
  });
});

describe('seedDemo when the demo college has an administrator', () => {
  it('creates no invitation', async () => {
    const tenantId = await revokeDemoInvitations();
    const admin = await makeUser(tenantId, { role: 'admin' });
    try {
      await expect(seedDemo(migrationUrl())).resolves.toEqual({
        tenantId,
        adminInvitationToken: null,
        adminInvitationPending: false,
      });
      const pending = await ownerTenantQuery(
        tenantId,
        `SELECT 1 FROM invitations WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      expect(pending.rowCount).toBe(0);
    } finally {
      await ownerQuery('DELETE FROM users WHERE id = $1', [admin.id]);
    }
  });
});

describe('seed script (pnpm db:seed)', () => {
  // Only the variables the script reads; the URLs point at the test database (vitest.config.ts).
  function seedScript(env: Record<string, string>) {
    const { DATABASE_URL, DATABASE_MIGRATION_URL } = getAdminDbEnv();
    return run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
      cwd: PACKAGE_ROOT,
      env: { DATABASE_URL, DATABASE_MIGRATION_URL, ...env },
    });
  }

  it(
    'run twice leaves one demo college with five divisions, prints the link once, then a hint',
    { timeout: 60_000 },
    async () => {
      const tenantId = await revokeDemoInvitations();
      const first = await seedScript({ APP_ENV: 'test', APP_URL });
      const lines = first.stdout.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(`Demo college ready: ${DEMO_SLUG}`);
      const prefix = `Admin invitation link: ${APP_URL}/ar/invite/`;
      expect(lines[1]?.startsWith(prefix)).toBe(true);
      const token = lines[1]?.slice(prefix.length) ?? '';
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await invitationByToken(tenantId, token)).toMatchObject({
        email: DEMO_ADMIN_EMAIL,
        role: 'admin',
        status: 'pending',
      });

      const second = await seedScript({ APP_ENV: 'test', APP_URL });
      expect(second.stdout.trim().split('\n')).toEqual([
        `Demo college ready: ${DEMO_SLUG}`,
        'Admin invitation already pending: no new link was created (revoke it to get a new link).',
      ]);
      expect(await countTenants(DEMO_SLUG)).toBe(1);
      expect(await divisionCodes(tenantId)).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
    },
  );

  it('refuses to run without APP_URL', { timeout: 60_000 }, async () => {
    // Pointed at a database that does not exist: reaching the database would print "Seed failed" instead.
    const missing = withDatabaseName(migrationUrl(), 'masari_test_does_not_exist');
    const failure = await seedScript({ APP_ENV: 'test', DATABASE_MIGRATION_URL: missing }).then(
      () => undefined,
      (error: unknown) => error as { code?: number; stderr?: string },
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr?.trim()).toBe(
      'APP_URL is not set; it is needed for the admin invitation link. Nothing was changed.',
    );
  });

  it.each<[string, Record<string, string>]>([
    ['production', { APP_ENV: 'production' }],
    ['not set', {}],
  ])('refuses to run when APP_ENV is %s', { timeout: 60_000 }, async (shown, env) => {
    // Pointed at a database that does not exist: reaching the database would print "Seed failed" instead.
    const missing = withDatabaseName(migrationUrl(), 'masari_test_does_not_exist');
    const failure = await seedScript({ ...env, DATABASE_MIGRATION_URL: missing }).then(
      () => undefined,
      (error: unknown) => error as { code?: number; stderr?: string },
    );
    expect(failure?.code).toBe(1);
    expect(failure?.stderr?.trim()).toBe(
      `Refusing to seed demo data: APP_ENV is ${shown}; it must be development or test. Nothing was changed.`,
    );
  });
});
