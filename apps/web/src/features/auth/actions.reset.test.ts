import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { requestPasswordResetAction, resetPasswordAction } from './actions';

// Password recovery actions (contracts/server-actions.md §4.5–4.6). The e2e tests in
// e2e/password-reset.spec.ts drive the real library; here every collaborator is mocked to reach the
// branches they cannot (failing library calls, missing accounts after a request, unexpected errors) and to
// pin down that a known and an unknown address get the same answer before any account-specific work.

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  recordAudit: vi.fn(),
  enforceRateLimit: vi.fn(),
  rateLimitRules: vi.fn(),
  after: vi.fn(),
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
}

vi.mock('@masari/db', () => ({
  tenants: {},
  sessions: {},
  users: { findByEmail: mocks.findByEmail },
}));
vi.mock('better-auth/api', () => ({
  isAPIError: (error: unknown) => error instanceof Error && error.name === 'APIError',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/server/auth/session', () => ({ getSessionContext: vi.fn() }));
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
      requestPasswordReset: mocks.requestPasswordReset,
      resetPassword: mocks.resetPassword,
    },
  }),
}));
vi.mock('@/server/email/send', () => ({ sendEmail: vi.fn() }));
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
const EMAIL = 'mona@example.edu';
const TOKEN = 'Tk9'.repeat(8);
const PASSWORD = 'Ab1'.repeat(4);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Runs the callbacks the action scheduled with `after` (the work done after the response). */
async function runAfterCallbacks(): Promise<void> {
  for (const [callback] of mocks.after.mock.calls as [() => Promise<void>][]) await callback();
}

beforeEach(() => {
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.rateLimitRules.mockReturnValue([]);
  mocks.findByEmail.mockResolvedValue(null);
  mocks.requestPasswordReset.mockResolvedValue({ status: true });
  mocks.resetPassword.mockResolvedValue({ status: true });
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('requestPasswordResetAction', () => {
  it('answers ok for a known and an unknown address alike, before any account-specific work', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    const known = await requestPasswordResetAction(null, form({ email: ' Mona@Example.EDU ' }));
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
    expect(mocks.findByEmail).not.toHaveBeenCalled();

    mocks.findByEmail.mockResolvedValue(null);
    const unknown = await requestPasswordResetAction(null, form({ email: 'nobody@example.edu' }));

    expect(known).toStrictEqual(ok(undefined));
    expect(unknown).toStrictEqual(known);
    expect(mocks.after).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitRules).toHaveBeenCalledWith('reset-request', {
      email: EMAIL,
      ip: '198.18.0.1',
    });
  });

  it('asks the library for the email with the page locale and audits the known account', async () => {
    mocks.findByEmail.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID });
    await requestPasswordResetAction(null, form({ email: EMAIL }));
    await runAfterCallbacks();

    expect(mocks.requestPasswordReset).toHaveBeenCalledExactlyOnceWith({
      body: { email: EMAIL, redirectTo: '/en/reset-password' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      { action: 'auth.password_reset_requested', targetId: USER_ID },
    );
  });

  it('writes no audit row for an unknown address', async () => {
    await requestPasswordResetAction(null, form({ email: 'nobody@example.edu' }));
    await runAfterCallbacks();
    expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('logs a failure after the response by error class only, and never throws', async () => {
    mocks.requestPasswordReset.mockRejectedValue(new TypeError(`no route for ${EMAIL}`));
    await expect(requestPasswordResetAction(null, form({ email: EMAIL }))).resolves.toStrictEqual(
      ok(undefined),
    );
    await expect(runAfterCallbacks()).resolves.toBeUndefined();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.reset_request_failed', {
      errorName: 'TypeError',
    });
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(EMAIL);
  });

  it('returns validation errors with the entered email, before rate limiting', async () => {
    const result = await requestPasswordResetAction(null, form({ email: 'not-an-email' }));
    expect(result).toStrictEqual(
      fail('validation', {
        fieldErrors: { email: 'invalid_email' },
        meta: { email: 'not-an-email' },
      }),
    );
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('returns the rate-limit refusal without scheduling any work', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 600 }));
    const result = await requestPasswordResetAction(null, form({ email: EMAIL }));
    expect(result).toMatchObject({ ok: false, code: 'rate_limited', retryAfterSeconds: 600 });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('returns internal on an unexpected error without leaking it', async () => {
    mocks.enforceRateLimit.mockRejectedValue(new RangeError(EMAIL));
    const result = await requestPasswordResetAction(null, form({ email: EMAIL }));
    expect(result).toMatchObject({ ok: false, code: 'internal' });
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.reset_request_failed', {
      errorName: 'RangeError',
    });
  });
});

/** The redirect target, or the returned result when the action did not redirect. */
async function runReset(data: FormData): Promise<unknown> {
  try {
    return await resetPasswordAction(null, data);
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    throw error;
  }
}

describe('resetPasswordAction', () => {
  it('sets the new password through the library and sends the user to sign in', async () => {
    await expect(runReset(form({ token: TOKEN, password: PASSWORD }))).resolves.toEqual({
      redirect: '/en/sign-in?reset=1',
    });
    expect(mocks.resetPassword).toHaveBeenCalledExactlyOnceWith({
      body: { token: TOKEN, newPassword: PASSWORD },
    });
  });

  it('answers token_invalid when the library refuses the token', async () => {
    mocks.resetPassword.mockRejectedValue(new FakeAPIError('INVALID_TOKEN'));
    await expect(runReset(form({ token: TOKEN, password: PASSWORD }))).resolves.toStrictEqual(
      fail('token_invalid'),
    );
  });

  it.each<Record<string, string>>([{}, { token: '' }, { token: 'a/b' }])(
    'answers token_invalid for a missing or malformed token %j without calling the library',
    async (fields) => {
      await expect(runReset(form({ ...fields, password: PASSWORD }))).resolves.toStrictEqual(
        fail('token_invalid'),
      );
      expect(mocks.resetPassword).not.toHaveBeenCalled();
    },
  );

  it('returns the password field error without echoing the password', async () => {
    const result = await runReset(form({ token: TOKEN, password: 'short' }));
    expect(result).toStrictEqual(
      fail('validation', { fieldErrors: { password: 'password_too_short' } }),
    );
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it('returns internal on an unexpected error, logging only its class', async () => {
    mocks.resetPassword.mockRejectedValue(new TypeError(`connection refused ${TOKEN}`));
    await expect(runReset(form({ token: TOKEN, password: PASSWORD }))).resolves.toMatchObject({
      ok: false,
      code: 'internal',
    });
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.reset_password_failed', {
      errorName: 'TypeError',
    });
  });
});
