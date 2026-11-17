import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SLUG, seedDemo } from '../src/admin/seed';
import { createTenant, setTenantStatus } from '../src/admin/tenants';
import { withDatabaseName } from '../src/admin/database';
import { withTenant } from '../src/context';
import { getAdminDbEnv } from '../src/env';
import * as divisions from '../src/repositories/divisions';
import { closeTestPools, makeTenant, makeUser, ownerQuery, randomSlug } from './helpers';

// contracts/db-api.md §4 (the parts delivered in PR-6): createTenant defaults + GEN division; duplicate slug;
// seedDemo is idempotent; `pnpm db:seed` twice leaves one demo college with five divisions. Tenant-scoped
// rows are written with the tenant context set, so creation also works for a hosted owner role that is not a
// superuser and is therefore subject to the forced RLS of `divisions` (proved with a scratch role below).

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const NON_SUPERUSER_OWNER = 'masari_test_admin_owner';
const SCRATCH_ROLE_LIFETIME_MS = 15 * 60_000;
const ALL_MODULES = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'];
const run = promisify(execFile);

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

  it('seeds the demo college under the same role, idempotently', async () => {
    const first = await seedDemo(scratchUrl);
    expect(await divisionCodes(first.tenantId)).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
    const second = await seedDemo(scratchUrl);
    expect(second).toEqual(first);
    expect(await divisionCodes(second.tenantId)).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
    expect(await countTenants(DEMO_SLUG)).toBe(1);
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

describe('seedDemo', () => {
  it('is idempotent: one demo college with five divisions', async () => {
    const first = await seedDemo(migrationUrl());
    const second = await seedDemo(migrationUrl());
    expect(second).toEqual(first);
    expect(first.adminInvitationToken).toBeNull();
    expect(await countTenants(DEMO_SLUG)).toBe(1);

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

describe('seed script (pnpm db:seed)', () => {
  // Only the variables the script reads; the URLs point at the test database (vitest.config.ts).
  function seedScript(env: Record<string, string>) {
    const { DATABASE_URL, DATABASE_MIGRATION_URL } = getAdminDbEnv();
    return run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
      cwd: PACKAGE_ROOT,
      env: { DATABASE_URL, DATABASE_MIGRATION_URL, ...env },
    });
  }

  it('run twice leaves one demo college with five divisions', { timeout: 60_000 }, async () => {
    for (let i = 0; i < 2; i += 1) {
      const { stdout } = await seedScript({ APP_ENV: 'test' });
      expect(stdout.trim()).toBe(`Demo college ready: ${DEMO_SLUG}`);
    }
    expect(await countTenants(DEMO_SLUG)).toBe(1);
    const tenant = await ownerQuery<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
      DEMO_SLUG,
    ]);
    expect(await divisionCodes(tenant.rows[0]?.id ?? '')).toEqual(['GEN', 'CS', 'IS', 'IT', 'AI']);
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
