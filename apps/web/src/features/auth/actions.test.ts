import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { registerStudentAction, resendVerificationAction } from './actions';

// Branches of registerStudentAction and resendVerificationAction that the e2e tests cannot reach
// (contracts/server-actions.md §4.1–4.2): suspended or unknown college, the domain rule (end-to-end in
// PR-35), already-confirmed accounts, failing emails, and unexpected errors. Every collaborator is
// mocked; redirect() throws like Next.js does.

const mocks = vi.hoisted(() => ({
  findBySlug: vi.fn(),
  findByEmail: vi.fn(),
  signUpEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendEmail: vi.fn(),
  recordAudit: vi.fn(),
  enforceRateLimit: vi.fn(),
  rateLimitRules: vi.fn(),
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
  rateLimitRules: mocks.rateLimitRules,
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

/** What the action echoes back on every failure: the fields of form() except the password. */
const ENTERED = {
  tenantSlug: 'demo',
  name: 'Mona Ali',
  email: 'mona@example.edu',
  consent: 'on',
};

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
  mocks.rateLimitRules.mockReturnValue([]);
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

  it('returns validation errors before any other work, echoing the fields but never the password', async () => {
    const result = await run(form({ consent: 'off', name: ' M ', email: 'Not-An-Email' }));
    expect(result).toStrictEqual(
      fail('validation', {
        fieldErrors: { name: 'too_short', email: 'invalid_email', consent: 'consent_required' },
        meta: { tenantSlug: 'demo', name: ' M ', email: 'Not-An-Email', consent: 'off' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('Ab1'.repeat(4));
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('echoes the first value of a duplicated field, the one that was validated', async () => {
    const data = form({ name: 'M' });
    data.append('name', 'A valid second name');
    data.append('tenantSlug', 'other');
    const result = await run(data);
    expect(result).toMatchObject({
      code: 'validation',
      fieldErrors: { name: 'too_short' },
      meta: { name: 'M', tenantSlug: 'demo' },
    });
  });

  it('echoes at most 254 characters per field and skips missing fields', async () => {
    const data = new FormData();
    data.append('name', 'x'.repeat(300));
    data.append('password', 'Ab1'.repeat(4));
    const result = await run(data);
    expect(result).toMatchObject({ meta: { name: 'x'.repeat(254) } });
    expect(Object.keys((result as { meta: object }).meta)).toEqual(['name']);
  });

  it('returns the rate-limit refusal', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 60 }));
    await expect(run(form())).resolves.toEqual(
      fail('rate_limited', { retryAfterSeconds: 60, meta: ENTERED }),
    );
    expect(mocks.findBySlug).not.toHaveBeenCalled();
  });

  it.each([null, { ...COLLEGE, status: 'suspended' }])(
    'refuses a missing or suspended college as invalid_choice (%#)',
    async (college) => {
      mocks.findBySlug.mockResolvedValue(college);
      await expect(run(form())).resolves.toEqual(
        fail('validation', { fieldErrors: { tenantSlug: 'invalid_choice' }, meta: ENTERED }),
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
        meta: { domains: 'stud.example.edu, example.org', ...ENTERED },
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
    await expect(run(form())).resolves.toEqual(fail('internal', { meta: ENTERED }));
    expect(mocks.log.error).toHaveBeenCalledWith('auth.register_failed', {
      errorName: 'TypeError',
    });
  });
});

describe('resendVerificationAction', () => {
  function resendForm(email: string): FormData {
    const data = new FormData();
    data.append('email', email);
    return data;
  }

  it('sends a new confirmation to an unconfirmed account, with the page locale', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, emailVerified: false });
    await expect(resendVerificationAction(null, resendForm(' Mona@Example.EDU '))).resolves.toEqual(
      ok(undefined),
    );
    expect(mocks.rateLimitRules).toHaveBeenCalledWith('verify-resend', {
      email: 'mona@example.edu',
      ip: '198.18.0.1',
    });
    expect(mocks.findByEmail).toHaveBeenCalledWith('mona@example.edu');
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      body: { email: 'mona@example.edu', callbackURL: '/en/email-verified' },
    });
  });

  it.each([
    ['an unknown address', null],
    ['a confirmed account', { id: USER_ID, tenantId: TENANT_ID, emailVerified: true }],
  ])('answers the same and sends nothing for %s', async (_case, user) => {
    mocks.findByEmail.mockResolvedValue(user);
    await expect(resendVerificationAction(null, resendForm('mona@example.edu'))).resolves.toEqual(
      ok(undefined),
    );
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('answers the same when the email cannot be sent', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, emailVerified: false });
    mocks.sendVerificationEmail.mockRejectedValue(new Error('smtp down'));
    await expect(resendVerificationAction(null, resendForm('mona@example.edu'))).resolves.toEqual(
      ok(undefined),
    );
    expect(mocks.log.warn).toHaveBeenCalledWith('auth.verification_not_sent', {
      errorName: 'Error',
    });
  });

  it('returns validation errors with the entered email, before rate limiting', async () => {
    await expect(resendVerificationAction(null, resendForm('not-an-email'))).resolves.toEqual(
      fail('validation', {
        fieldErrors: { email: 'invalid_email' },
        meta: { email: 'not-an-email' },
      }),
    );
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('returns the rate-limit refusal before looking up the account', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 3600 }));
    await expect(resendVerificationAction(null, resendForm('mona@example.edu'))).resolves.toEqual(
      fail('rate_limited', { retryAfterSeconds: 3600, meta: { email: 'mona@example.edu' } }),
    );
    expect(mocks.findByEmail).not.toHaveBeenCalled();
  });

  it('returns internal on an unexpected error without leaking it', async () => {
    mocks.findByEmail.mockRejectedValue(new TypeError('connection refused'));
    await expect(resendVerificationAction(null, resendForm('mona@example.edu'))).resolves.toEqual(
      fail('internal', { meta: { email: 'mona@example.edu' } }),
    );
    expect(mocks.log.error).toHaveBeenCalledWith('auth.resend_failed', { errorName: 'TypeError' });
  });
});
