import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail } from '@/lib/result';
import { registerStudentAction } from './actions';

// Branches of registerStudentAction that the e2e tests cannot reach (contracts/server-actions.md §4.1):
// suspended or unknown college, the domain rule (end-to-end in PR-35), failing emails, and unexpected
// errors. Every collaborator is mocked; redirect() throws like Next.js does.

const mocks = vi.hoisted(() => ({
  findBySlug: vi.fn(),
  findByEmail: vi.fn(),
  signUpEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendEmail: vi.fn(),
  recordAudit: vi.fn(),
  enforceRateLimit: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT');
  }
}

vi.mock('@masari/db', () => ({
  tenants: { findBySlug: mocks.findBySlug },
  users: { findByEmail: mocks.findByEmail },
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectSignal) throw error;
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en') }));
vi.mock('@/server/auth/auth', () => ({
  getAuth: () => ({
    api: { signUpEmail: mocks.signUpEmail, sendVerificationEmail: mocks.sendVerificationEmail },
  }),
}));
vi.mock('@/server/email/send', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/env', () => ({ getEnv: () => ({ APP_URL: 'https://masari.example' }) }));
vi.mock('@/server/log', () => ({ log: mocks.log }));
vi.mock('@/server/request', () => ({ getClientIp: () => Promise.resolve('198.18.0.1') }));
vi.mock('@/server/rate-limit', () => ({
  rateLimitRules: () => [],
  enforceRateLimit: mocks.enforceRateLimit,
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user'.repeat(4);
const COLLEGE = { id: TENANT_ID, status: 'active', allowedEmailDomains: [] as string[] };

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    tenantSlug: 'demo',
    name: 'Mona Ali',
    email: 'mona@example.edu',
    password: 'Ab1'.repeat(4),
    consent: 'on',
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** The redirect target, or the returned result when the action did not redirect. */
async function run(data: FormData): Promise<unknown> {
  try {
    return await registerStudentAction(null, data);
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    throw error;
  }
}

beforeEach(() => {
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.findBySlug.mockResolvedValue(COLLEGE);
  mocks.findByEmail.mockResolvedValue(null);
  mocks.signUpEmail.mockImplementation(() => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    return Promise.resolve({ token: null, user: { id: USER_ID } });
  });
  mocks.sendVerificationEmail.mockResolvedValue({ status: true });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('registerStudentAction', () => {
  it('creates a student with the page locale, sends the confirmation, audits, and redirects', async () => {
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    // Role and status are never passed: they take their defaults (student, active).
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: 'Mona Ali',
        email: 'mona@example.edu',
        password: 'Ab1'.repeat(4),
        tenantId: TENANT_ID,
        locale: 'en',
        privacyConsentAt: expect.any(Date) as Date,
      },
    });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      body: { email: 'mona@example.edu', callbackURL: '/en/email-verified' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      { action: 'user.registered', targetId: USER_ID },
    );
  });

  it('returns validation errors before any other work', async () => {
    const result = await run(form({ consent: 'off' }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { consent: 'consent_required' } });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('returns the rate-limit refusal', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 60 }));
    await expect(run(form())).resolves.toEqual(fail('rate_limited', { retryAfterSeconds: 60 }));
    expect(mocks.findBySlug).not.toHaveBeenCalled();
  });

  it.each([null, { ...COLLEGE, status: 'suspended' }])(
    'refuses a missing or suspended college as invalid_choice (%#)',
    async (college) => {
      mocks.findBySlug.mockResolvedValue(college);
      await expect(run(form())).resolves.toEqual(
        fail('validation', { fieldErrors: { tenantSlug: 'invalid_choice' } }),
      );
      expect(mocks.signUpEmail).not.toHaveBeenCalled();
    },
  );

  it('refuses an address outside the allowed domains and names them', async () => {
    mocks.findBySlug.mockResolvedValue({
      ...COLLEGE,
      allowedEmailDomains: ['stud.example.edu', 'example.org'],
    });
    await expect(run(form())).resolves.toEqual(
      fail('validation', {
        fieldErrors: { email: 'domain_not_allowed' },
        meta: { domains: 'stud.example.edu, example.org' },
      }),
    );
  });

  it('only notifies the owner of an existing account, with the same redirect', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'account-exists', to: 'mona@example.edu' }),
    );
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still redirects when an email cannot be sent', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    mocks.sendEmail.mockRejectedValue(new Error('smtp down'));
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.log.error).toHaveBeenCalledWith('email.failed', { template: 'account-exists' });

    mocks.findByEmail.mockResolvedValue(null);
    mocks.sendVerificationEmail.mockRejectedValue(new Error('smtp down'));
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it('does not audit when the library did not create the account (concurrent registration)', async () => {
    mocks.signUpEmail.mockResolvedValue({ token: null, user: { id: 'made-up-id' } });
    mocks.findByEmail.mockResolvedValueOnce(null).mockResolvedValue({
      id: USER_ID,
      tenantId: TENANT_ID,
    });
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('returns internal on an unexpected error without leaking it', async () => {
    mocks.findBySlug.mockRejectedValue(new TypeError('connection refused'));
    await expect(run(form())).resolves.toEqual(fail('internal'));
    expect(mocks.log.error).toHaveBeenCalledWith('auth.register_failed', {
      errorName: 'TypeError',
    });
  });
});
