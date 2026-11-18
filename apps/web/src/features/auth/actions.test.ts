import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import {
  registerStudentAction,
  resendVerificationAction,
  signInAction,
  signOutAction,
} from './actions';

// Branches of registerStudentAction and resendVerificationAction that the e2e tests cannot reach
// (contracts/server-actions.md §4.1–4.2): suspended or unknown college, the domain rule (end-to-end in
// PR-35), already-confirmed accounts, failing emails, and unexpected errors. Every collaborator is
// mocked; redirect() throws like Next.js does.

const mocks = vi.hoisted(() => ({
  findBySlug: vi.fn(),
  findByEmail: vi.fn(),
  awaitsAccount: vi.fn(),
  withTenant: vi.fn(),
  findUserById: vi.fn(),
  findTenantById: vi.fn(),
  revokeAllForUser: vi.fn(),
  revokeByToken: vi.fn(),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  signOut: vi.fn(),
  getSessionContext: vi.fn(),
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

/** Stands in for the auth library's APIError (matched by name, like the library's isAPIError). */
class FakeAPIError extends Error {
  override name = 'APIError';
  constructor(readonly body: { code: string }) {
    super(body.code);
  }
}

vi.mock('@masari/db', () => ({
  tenants: { findBySlug: mocks.findBySlug, findById: mocks.findTenantById },
  users: { findByEmail: mocks.findByEmail, findById: mocks.findUserById },
  sessions: { revokeAllForUser: mocks.revokeAllForUser, revokeByToken: mocks.revokeByToken },
  invitations: { awaitsAccount: mocks.awaitsAccount },
  withTenant: mocks.withTenant,
}));
vi.mock('better-auth/api', () => ({
  isAPIError: (error: unknown) => error instanceof Error && error.name === 'APIError',
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'session=current' })),
}));
vi.mock('@/server/auth/session', () => ({ getSessionContext: mocks.getSessionContext }));
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
    api: {
      signUpEmail: mocks.signUpEmail,
      sendVerificationEmail: mocks.sendVerificationEmail,
      signInEmail: mocks.signInEmail,
      signOut: mocks.signOut,
    },
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
const COLLEGE = {
  id: TENANT_ID,
  status: 'active',
  allowedEmailDomains: [] as string[],
  nameAr: 'كلية التجربة',
  nameEn: 'Trial College',
};
const TX = { fake: 'tx' };

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
  mocks.awaitsAccount.mockResolvedValue(false);
  mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(TX));
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

  it('only tells the invitee about their invitation, with the same redirect and no account (step 6)', async () => {
    mocks.awaitsAccount.mockResolvedValue(true);
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: null },
      expect.any(Function),
    );
    expect(mocks.awaitsAccount).toHaveBeenCalledExactlyOnceWith(TX, 'mona@example.edu');
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const message = mocks.sendEmail.mock.calls[0]?.[0] as {
      template: string;
      to: string;
      text: string;
    };
    expect(message).toMatchObject({ template: 'invitation-pending', to: 'mona@example.edu' });
    expect(message.text).toContain(COLLEGE.nameEn);
    expect(mocks.log.info).toHaveBeenCalledWith('email.sent', { template: 'invitation-pending' });
    expect(JSON.stringify(mocks.log.info.mock.calls)).not.toContain('mona@example.edu');
  });

  it('checks the invitations only when the address has no account', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    mocks.awaitsAccount.mockResolvedValue(true);
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.awaitsAccount).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ template: 'account-exists' }),
    );
  });

  it('still redirects when the invitation-pending email cannot be sent, logging the template only', async () => {
    mocks.awaitsAccount.mockResolvedValue(true);
    mocks.sendEmail.mockRejectedValue(new Error('smtp refused mona@example.edu'));
    await expect(run(form())).resolves.toEqual({ redirect: '/en/verify-email' });
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('email.failed', {
      template: 'invitation-pending',
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
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

describe('signInAction', () => {
  const SESSION_TOKEN = 'Tk9'.repeat(4);
  const SESSION_COOKIE = `better-auth.session_token=${SESSION_TOKEN}.sig`;
  const ACTIVE_USER = { id: USER_ID, tenantId: TENANT_ID, status: 'active', locale: 'ar' };

  function signInForm(fields: Record<string, string> = {}): FormData {
    const data = new FormData();
    const all = { email: ' Mona@Example.EDU ', password: 'Ab1'.repeat(4), ...fields };
    for (const [key, value] of Object.entries(all)) data.append(key, value);
    return data;
  }

  async function runSignIn(data: FormData): Promise<unknown> {
    try {
      return await signInAction(null, data);
    } catch (error) {
      if (error instanceof RedirectSignal) return { redirect: error.url };
      throw error;
    }
  }

  beforeEach(() => {
    const responseHeaders = new Headers();
    responseHeaders.append('set-cookie', `${SESSION_COOKIE}; Path=/; HttpOnly; SameSite=Lax`);
    mocks.signInEmail.mockResolvedValue({
      headers: responseHeaders,
      response: { token: SESSION_TOKEN, user: { id: USER_ID } },
    });
    mocks.signOut.mockResolvedValue({ success: true });
    mocks.revokeByToken.mockResolvedValue(1);
    mocks.findUserById.mockResolvedValue(ACTIVE_USER);
    mocks.findTenantById.mockResolvedValue({ id: TENANT_ID, status: 'active' });
    mocks.revokeAllForUser.mockResolvedValue(1);
  });

  it('signs in, audits auth.sign_in, and lands on the dashboard in the user’s language', async () => {
    await expect(runSignIn(signInForm())).resolves.toEqual({ redirect: '/ar/dashboard' });
    expect(mocks.rateLimitRules).toHaveBeenCalledWith('signin', {
      email: 'mona@example.edu',
      ip: '198.18.0.1',
    });
    expect(mocks.signInEmail).toHaveBeenCalledWith({
      body: { email: 'mona@example.edu', password: 'Ab1'.repeat(4) },
      returnHeaders: true,
      returnStatus: false,
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      { action: 'auth.sign_in', targetId: USER_ID },
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('honours a safe next under the user’s language and ignores an unsafe one', async () => {
    mocks.findUserById.mockResolvedValue({ ...ACTIVE_USER, locale: 'en' });
    await expect(runSignIn(signInForm({ next: '/profile?tab=1' }))).resolves.toEqual({
      redirect: '/en/profile?tab=1',
    });
    await expect(runSignIn(signInForm({ next: '//evil.test' }))).resolves.toEqual({
      redirect: '/en/dashboard',
    });
  });

  it.each([
    ['a wrong password', 'INVALID_EMAIL_OR_PASSWORD'],
    ['an unknown email', 'INVALID_EMAIL_OR_PASSWORD'],
    ['any other library refusal', 'PASSWORD_TOO_LONG'],
  ])('returns the same invalid_credentials for %s', async (_case, code) => {
    mocks.signInEmail.mockRejectedValue(new FakeAPIError({ code }));
    await expect(runSignIn(signInForm())).resolves.toStrictEqual(
      fail('invalid_credentials', { meta: { email: ' Mona@Example.EDU ' } }),
    );
    expect(mocks.findUserById).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('returns email_not_verified for a correct password of an unconfirmed address', async () => {
    mocks.signInEmail.mockRejectedValue(new FakeAPIError({ code: 'EMAIL_NOT_VERIFIED' }));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({
      ok: false,
      code: 'email_not_verified',
    });
  });

  it('ends the new session and every other session of a suspended account', async () => {
    mocks.findUserById.mockResolvedValue({ ...ACTIVE_USER, status: 'suspended' });
    await expect(runSignIn(signInForm())).resolves.toMatchObject({
      ok: false,
      code: 'account_suspended',
    });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('ends only the new session when the college is suspended', async () => {
    mocks.findTenantById.mockResolvedValue({ id: TENANT_ID, status: 'suspended' });
    await expect(runSignIn(signInForm())).resolves.toMatchObject({
      ok: false,
      code: 'tenant_suspended',
    });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.revokeAllForUser).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('always deletes the new session row too, because the library swallows a failing delete', async () => {
    // The library answers success even when its own session delete failed (it only logs it).
    mocks.findTenantById.mockResolvedValue({ id: TENANT_ID, status: 'suspended' });
    mocks.signOut.mockResolvedValue({ success: true });
    mocks.revokeByToken.mockResolvedValue(0);
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ code: 'tenant_suspended' });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  /** The Cookie header of the (only) library sign-out call. */
  function signOutCookie(): string | null {
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    const [call] = mocks.signOut.mock.calls[0] as [{ headers: Headers }];
    return call.headers.get('cookie');
  }

  /** No log call carries anything but an event name and an error class name. */
  function expectLogsWithoutPersonalData(): void {
    for (const level of [mocks.log.info, mocks.log.warn, mocks.log.error]) {
      for (const call of level.mock.calls as unknown[][]) {
        expect(JSON.stringify(call)).not.toMatch(/mona|example\.edu|Tk9|Ab1/i);
      }
    }
  }

  it('ends the new session and answers internal when the audit fails', async () => {
    mocks.recordAudit.mockRejectedValue(new Error('db down'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.log.error).toHaveBeenCalledWith('auth.sign_in_failed', { errorName: 'Error' });
    expectLogsWithoutPersonalData();
  });

  it('ends the new session and answers internal when reading the account fails', async () => {
    mocks.findUserById.mockRejectedValue(new TypeError('connection refused'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('ends the new session and answers internal when reading the college fails', async () => {
    mocks.findTenantById.mockRejectedValue(new TypeError('connection refused'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    expect(signOutCookie()).toBe(SESSION_COOKIE);
  });

  it.each([
    ['account', () => mocks.findUserById.mockResolvedValue(null)],
    ['college', () => mocks.findTenantById.mockResolvedValue(null)],
  ])('warns and ends the new session when the %s is missing', async (_case, arrange) => {
    arrange();
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    expect(mocks.log.warn).toHaveBeenCalledWith('auth.sign_in_account_missing');
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expectLogsWithoutPersonalData();
  });

  it('deletes the new session row when the library cannot end it (suspended account)', async () => {
    mocks.findUserById.mockResolvedValue({ ...ACTIVE_USER, status: 'suspended' });
    mocks.signOut.mockRejectedValue(new Error('library down'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({
      ok: false,
      code: 'account_suspended',
    });
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.log.error).toHaveBeenCalledWith('auth.new_session_sign_out_failed', {
      errorName: 'Error',
    });
    expectLogsWithoutPersonalData();
  });

  it('answers internal when revoking a suspended account’s sessions fails, after ending the new one', async () => {
    mocks.findUserById.mockResolvedValue({ ...ACTIVE_USER, status: 'suspended' });
    mocks.revokeAllForUser.mockRejectedValue(new Error('db down'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    // The new session was ended once before the failure; the failure path does not end it again.
    expect(signOutCookie()).toBe(SESSION_COOKIE);
    expect(mocks.revokeByToken).toHaveBeenCalledTimes(1);
    expect(mocks.revokeByToken).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(mocks.log.error).toHaveBeenCalledWith('auth.sign_in_failed', { errorName: 'Error' });
  });

  it('still answers internal when neither the library nor the repository can end the session', async () => {
    mocks.recordAudit.mockRejectedValue(new Error('db down'));
    mocks.signOut.mockRejectedValue(new Error('library down'));
    mocks.revokeByToken.mockRejectedValue(new Error('db down'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ ok: false, code: 'internal' });
    expect(mocks.log.error).toHaveBeenCalledWith('auth.new_session_revoke_failed', {
      errorName: 'Error',
    });
    expectLogsWithoutPersonalData();
  });

  it('returns validation errors before rate limiting, never echoing the password', async () => {
    await expect(runSignIn(signInForm({ email: 'nope', password: '' }))).resolves.toStrictEqual(
      fail('validation', {
        fieldErrors: { email: 'invalid_email', password: 'required' },
        meta: { email: 'nope' },
      }),
    );
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('returns the rate-limit refusal before asking the library', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 600 }));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 600,
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it('returns internal on an unexpected error without leaking it', async () => {
    mocks.signInEmail.mockRejectedValue(new TypeError('connection refused'));
    await expect(runSignIn(signInForm())).resolves.toMatchObject({ code: 'internal' });
    expect(mocks.log.error).toHaveBeenCalledWith('auth.sign_in_failed', {
      errorName: 'TypeError',
    });
  });
});

describe('signOutAction', () => {
  const CTX = { user: { id: USER_ID }, tenant: { id: TENANT_ID } };

  async function runSignOut(): Promise<unknown> {
    try {
      await signOutAction();
      return null;
    } catch (error) {
      if (error instanceof RedirectSignal) return { redirect: error.url };
      throw error;
    }
  }

  it('audits auth.sign_out, ends the current session, and goes to sign-in', async () => {
    mocks.getSessionContext.mockResolvedValue(CTX);
    mocks.signOut.mockResolvedValue({ success: true });
    await expect(runSignOut()).resolves.toEqual({ redirect: '/en/sign-in' });
    expect(mocks.recordAudit).toHaveBeenCalledWith(CTX, {
      action: 'auth.sign_out',
      targetId: USER_ID,
    });
    const [call] = mocks.signOut.mock.calls[0] as [{ headers: Headers }];
    expect(call.headers.get('cookie')).toBe('session=current');
  });

  it('still ends the session the library can read when there is no usable session, without auditing', async () => {
    // e.g. the account or the college was suspended after signing in.
    mocks.getSessionContext.mockResolvedValue(null);
    mocks.signOut.mockResolvedValue({ success: true });
    await expect(runSignOut()).resolves.toEqual({ redirect: '/en/sign-in' });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    const [call] = mocks.signOut.mock.calls[0] as [{ headers: Headers }];
    expect(call.headers.get('cookie')).toBe('session=current');
  });

  it('still redirects when the library cannot end the session', async () => {
    mocks.getSessionContext.mockResolvedValue(null);
    mocks.signOut.mockRejectedValue(new TypeError('connection refused'));
    await expect(runSignOut()).resolves.toEqual({ redirect: '/en/sign-in' });
    expect(mocks.log.error).toHaveBeenCalledWith('auth.sign_out_failed', {
      errorName: 'TypeError',
    });
  });

  it('still ends the session when the audit fails', async () => {
    mocks.getSessionContext.mockResolvedValue(CTX);
    mocks.recordAudit.mockRejectedValue(new Error('db down'));
    await expect(runSignOut()).resolves.toEqual({ redirect: '/en/sign-in' });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.log.error).toHaveBeenCalledWith('auth.sign_out_audit_failed', {
      errorName: 'Error',
    });
  });
});
