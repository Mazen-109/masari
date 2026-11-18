import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { getAdminDbEnv } from '../src/env';
import { hashInvitationToken } from '../src/tokens';
import { closeTestPools, makeTenant, makeUser, ownerQuery, ownerTenantQuery } from './helpers';

// contracts/db-api.md §4 / cli.md §4–5: the operator scripts run as child processes against masari_test
// (exactly as `pnpm tenant:create` / `pnpm tenant:set-status` run them, minus dotenv), with their outputs
// and exit codes; nothing changes on failure; no connection string or token hash is ever printed.

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP_URL = 'http://localhost:3000';
const LINK_PREFIX = `Admin invitation link (valid 7 days): ${APP_URL}/ar/invite/`;
const CREATE_USAGE =
  'Usage: pnpm tenant:create --slug <slug> --name-ar "<Arabic name>" --name-en "<English name>" --admin-email <email>';
const run = promisify(execFile);

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

afterAll(closeTestPools);

/**
 * Runs a script with only the variables it reads; the URLs point at the test database. `overrides` replaces
 * variables; an undefined value removes the variable.
 */
async function script(
  name: string,
  args: string[],
  overrides: Record<string, string | undefined> = {},
): Promise<Outcome> {
  const { DATABASE_URL, DATABASE_MIGRATION_URL } = getAdminDbEnv();
  const env = Object.fromEntries(
    Object.entries({ DATABASE_URL, DATABASE_MIGRATION_URL, APP_URL, ...overrides }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ['--import', 'tsx', `scripts/${name}.ts`, ...args],
      { cwd: PACKAGE_ROOT, env },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

function createArgs(input: { slug: string; email: string }): string[] {
  return [
    '--slug',
    input.slug,
    '--name-ar',
    'كلية العلوم (تجريبي)',
    '--name-en',
    'Faculty of Science (Demo)',
    '--admin-email',
    input.email,
  ];
}

function freshSlug(): string {
  return `cli-${randomBytes(5).toString('hex')}`;
}

function freshEmail(): string {
  return `dean-${randomBytes(5).toString('hex')}@example.test`;
}

async function tenantsWithSlug(slug: string): Promise<{ id: string; name_en: string }[]> {
  const result = await ownerQuery<{ id: string; name_en: string }>(
    'SELECT id, name_en FROM tenants WHERE slug = $1',
    [slug],
  );
  return result.rows;
}

/** Asserts that output never contains a connection string, a token hash, or the email. */
function expectNothingSecret(outcome: Outcome, email?: string): void {
  const all = `${outcome.stdout}\n${outcome.stderr}`;
  expect(all).not.toMatch(/postgres(ql)?:\/\//);
  expect(all).not.toMatch(/\b[0-9a-f]{64}\b/);
  if (email) expect(all).not.toContain(email);
}

describe('tenant-create', () => {
  it(
    'creates the college, its GEN division, and the admin invitation, and prints the link once',
    { timeout: 60_000 },
    async () => {
      const slug = freshSlug();
      const email = freshEmail();
      const outcome = await script('tenant-create', createArgs({ slug, email }));
      expect(outcome.code).toBe(0);
      expect(outcome.stderr).toBe('');
      const lines = outcome.stdout.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(`College created: ${slug}`);
      expect(lines[1]?.startsWith(LINK_PREFIX)).toBe(true);
      const token = lines[1]?.slice(LINK_PREFIX.length) ?? '';
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expectNothingSecret(outcome, email);

      const [tenant] = await tenantsWithSlug(slug);
      expect(tenant?.name_en).toBe('Faculty of Science (Demo)');
      const tenantId = tenant?.id ?? '';
      const divisionRows = await ownerTenantQuery(
        tenantId,
        'SELECT code FROM divisions WHERE tenant_id = $1',
        [tenantId],
      );
      expect(divisionRows.rows).toEqual([{ code: 'GEN' }]);
      const invitation = await ownerTenantQuery(
        tenantId,
        'SELECT email, role, status FROM invitations WHERE token_hash = $1',
        [hashInvitationToken(token)],
      );
      expect(invitation.rows).toEqual([{ email, role: 'admin', status: 'pending' }]);
    },
  );

  it('refuses a used slug with exit 1 and changes nothing', { timeout: 60_000 }, async () => {
    const existing = await makeTenant({ nameEn: 'Original' });
    const email = freshEmail();
    const outcome = await script('tenant-create', createArgs({ slug: existing.slug, email }));
    expect(outcome).toEqual({
      code: 1,
      stdout: '',
      stderr: `A college with slug "${existing.slug}" already exists. Nothing was changed.\n`,
    });
    expect(await tenantsWithSlug(existing.slug)).toEqual([
      { id: existing.id, name_en: 'Original' },
    ]);
    const invitations = await ownerTenantQuery(
      existing.id,
      'SELECT 1 FROM invitations WHERE tenant_id = $1',
      [existing.id],
    );
    expect(invitations.rowCount).toBe(0);
  });

  it(
    'refuses an email that has an account with exit 1; the college is not created',
    {
      timeout: 60_000,
    },
    async () => {
      const elsewhere = await makeTenant();
      const user = await makeUser(elsewhere.id);
      const slug = freshSlug();
      const outcome = await script('tenant-create', createArgs({ slug, email: user.email }));
      expect(outcome).toEqual({
        code: 1,
        stdout: '',
        stderr: 'This email already has an account. Nothing was changed.\n',
      });
      expect(await tenantsWithSlug(slug)).toEqual([]);
    },
  );

  it.each<[string, string[], string]>([
    ['an invalid slug', createArgs({ slug: 'Not_A_Slug', email: 'dean@example.test' }), '--slug'],
    [
      'an invalid email',
      createArgs({ slug: 'valid-slug', email: 'not-an-email' }),
      '--admin-email',
    ],
    [
      'an empty name',
      ['--slug', 'valid-slug', '--name-ar', '', '--name-en', 'X', '--admin-email', 'a@b.test'],
      '--name-ar',
    ],
  ])('exits 2 with usage for %s', { timeout: 60_000 }, async (_label, args, name) => {
    const outcome = await script('tenant-create', args);
    expect(outcome.code).toBe(2);
    expect(outcome.stdout).toBe('');
    const lines = outcome.stderr.trim().split('\n');
    expect(lines[0]).toMatch(new RegExp(`^Invalid argument ${name}: `));
    expect(lines[1]).toBe(CREATE_USAGE);
    expect(await tenantsWithSlug('valid-slug')).toEqual([]);
  });

  it('exits 2 with usage for an unknown option', { timeout: 60_000 }, async () => {
    const outcome = await script('tenant-create', [
      ...createArgs({ slug: freshSlug(), email: freshEmail() }),
      '--force',
    ]);
    expect(outcome).toEqual({ code: 2, stdout: '', stderr: `Unknown option\n${CREATE_USAGE}\n` });
  });
});

describe('tenant-set-status', () => {
  async function statusOf(slug: string): Promise<string | undefined> {
    const result = await ownerQuery<{ status: string }>(
      'SELECT status FROM tenants WHERE slug = $1',
      [slug],
    );
    return result.rows[0]?.status;
  }

  it('suspends and reactivates a college', { timeout: 60_000 }, async () => {
    const tenant = await makeTenant();
    const suspended = await script('tenant-set-status', [
      '--slug',
      tenant.slug,
      '--status',
      'suspended',
    ]);
    expect(suspended).toEqual({
      code: 0,
      stdout: `College ${tenant.slug} is now suspended\n`,
      stderr: '',
    });
    expect(await statusOf(tenant.slug)).toBe('suspended');

    const active = await script('tenant-set-status', ['--slug', tenant.slug, '--status', 'active']);
    expect(active).toEqual({
      code: 0,
      stdout: `College ${tenant.slug} is now active\n`,
      stderr: '',
    });
    expect(await statusOf(tenant.slug)).toBe('active');
  });

  it('exits 1 for an unknown slug', { timeout: 60_000 }, async () => {
    const outcome = await script('tenant-set-status', [
      '--slug',
      freshSlug(),
      '--status',
      'suspended',
    ]);
    expect(outcome).toEqual({ code: 1, stdout: '', stderr: 'College not found\n' });
  });

  it('exits 2 with usage for an invalid status', { timeout: 60_000 }, async () => {
    const tenant = await makeTenant();
    const outcome = await script('tenant-set-status', [
      '--slug',
      tenant.slug,
      '--status',
      'closed',
    ]);
    expect(outcome.code).toBe(2);
    expect(outcome.stderr).toContain('Invalid argument --status: ');
    expect(outcome.stderr).toContain(
      'Usage: pnpm tenant:set-status --slug <slug> --status active|suspended',
    );
    expect(await statusOf(tenant.slug)).toBe('active');
  });
});

describe('failures never leak connection details', () => {
  /** The owner URL of the test server with a port where nothing listens. */
  function unreachableMigrationUrl(): string {
    const url = new URL(getAdminDbEnv().DATABASE_MIGRATION_URL);
    url.port = '1';
    return url.toString();
  }

  it(
    'tenant-create reports an unreachable database in one safe line with exit 1',
    {
      timeout: 60_000,
    },
    async () => {
      const email = freshEmail();
      const outcome = await script('tenant-create', createArgs({ slug: freshSlug(), email }), {
        DATABASE_MIGRATION_URL: unreachableMigrationUrl(),
      });
      expect(outcome.code).toBe(1);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toMatch(/^Creating the college failed: .+\. Nothing was changed\.\n$/);
      expectNothingSecret(outcome, email);
    },
  );

  it(
    'tenant-set-status reports an unreachable database in one safe line with exit 1',
    {
      timeout: 60_000,
    },
    async () => {
      const tenant = await makeTenant();
      const outcome = await script(
        'tenant-set-status',
        ['--slug', tenant.slug, '--status', 'suspended'],
        { DATABASE_MIGRATION_URL: unreachableMigrationUrl() },
      );
      expect(outcome.code).toBe(1);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toMatch(/^Changing the college status failed: .+\n$/);
      expect(outcome.stderr.trim().split('\n')).toHaveLength(1);
      expectNothingSecret(outcome);
      const status = await ownerQuery<{ status: string }>(
        'SELECT status FROM tenants WHERE id = $1',
        [tenant.id],
      );
      expect(status.rows).toEqual([{ status: 'active' }]);
    },
  );
});

describe('required settings and arguments', () => {
  it(
    'tenant-create without APP_URL exits 1 and creates no college',
    { timeout: 60_000 },
    async () => {
      const slug = freshSlug();
      const outcome = await script('tenant-create', createArgs({ slug, email: freshEmail() }), {
        APP_URL: undefined,
      });
      expect(outcome).toEqual({
        code: 1,
        stdout: '',
        stderr: 'APP_URL is not set; it is needed for the invitation link. Nothing was changed.\n',
      });
      expect(await tenantsWithSlug(slug)).toEqual([]);
    },
  );

  it(
    'tenant-set-status with a malformed slug exits 2 with usage',
    { timeout: 60_000 },
    async () => {
      const outcome = await script('tenant-set-status', [
        '--slug',
        'Not_A_Slug',
        '--status',
        'active',
      ]);
      expect(outcome.code).toBe(2);
      expect(outcome.stdout).toBe('');
      const lines = outcome.stderr.trim().split('\n');
      expect(lines[0]).toMatch(/^Invalid argument --slug: /);
      expect(lines[1]).toBe(
        'Usage: pnpm tenant:set-status --slug <slug> --status active|suspended',
      );
    },
  );
});
