import { afterEach, describe, expect, it, vi } from 'vitest';
import { authOptions, DRIZZLE_ADAPTER_OPTIONS, recordPasswordReset } from './auth';
import { hashPassword } from './password-hash';

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

afterEach(() => {
  vi.resetAllMocks();
});

// research.md §7: the settings handed to Better Auth. Building the options creates no instance and opens
// no connection; the runtime behaviour is covered by e2e/auth-endpoints.spec.ts.

const ENV = { APP_URL: 'https://masari.example.edu', BETTER_AUTH_SECRET: 'x'.repeat(32) };
const database = () => {
  throw new Error('the adapter is not used when only building options');
};
const options = authOptions(ENV, database);

describe('authOptions', () => {
  it('serves the handler under /api/auth for APP_URL and trusts only that origin', () => {
    expect(options).toMatchObject({
      baseURL: ENV.APP_URL,
      basePath: '/api/auth',
      secret: ENV.BETTER_AUTH_SECRET,
      trustedOrigins: [ENV.APP_URL],
      telemetry: { enabled: false },
    });
  });

  it('requires a confirmed email, 10–128 character passwords, and never signs in by itself', () => {
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
    });
    expect(options.emailVerification).toMatchObject({
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
      expiresIn: 86_400,
    });
  });

  it('hashes every password with the function registration also runs (FR-005)', () => {
    expect(options.emailAndPassword.password).toEqual({ hash: hashPassword });
  });

  it('makes reset links expire after one hour and audits a reset from the library hook', () => {
    // The 1-hour expiry cannot be waited for in an e2e test (tasks.md T100); this is its assertion.
    expect(options.emailAndPassword.resetPasswordTokenExpiresIn).toBe(60 * 60);
    expect(typeof options.emailAndPassword.onPasswordReset).toBe('function');
  });

  it('keeps sessions 7 days, refreshed daily, without a cookie cache', () => {
    expect(options.session).toEqual({
      expiresIn: 604_800,
      updateAge: 86_400,
      cookieCache: { enabled: false },
    });
  });

  it('stores verification values hashed and records no client address', () => {
    expect(options.verification).toEqual({ storeIdentifier: 'hashed' });
    expect(options.advanced).toEqual({ ipAddress: { disableIpTracking: true } });
  });

  it('never lets the auth API set role or status', () => {
    const fields = options.user.additionalFields;
    expect(fields.role).toMatchObject({ input: false, defaultValue: 'student' });
    expect(fields.status).toMatchObject({ input: false, defaultValue: 'active' });
    expect(fields.tenantId).toMatchObject({ input: true, required: true });
  });

  it('routes library logs through log.ts and leaves the level at the library default', () => {
    expect(Object.keys(options.logger)).toEqual(['log']);
  });

  it('ends the plugin list with nextCookies()', () => {
    expect(options.plugins.at(-1)?.id).toBe('next-cookies');
  });

  it('uses plural tables and transactions in the Drizzle adapter', () => {
    expect(DRIZZLE_ADAPTER_OPTIONS).toMatchObject({
      provider: 'pg',
      usePlural: true,
      transaction: true,
    });
    expect(Object.keys(DRIZZLE_ADAPTER_OPTIONS.schema).sort()).toEqual([
      'accounts',
      'sessions',
      'users',
      'verifications',
    ]);
  });
});

describe('recordPasswordReset (onPasswordReset hook)', () => {
  const USER = { id: 'user'.repeat(4), tenantId: '11111111-1111-4111-8111-111111111111' };

  it('records auth.password_reset for the account in its own college', async () => {
    mocks.recordAudit.mockResolvedValue(undefined);
    await options.emailAndPassword.onPasswordReset({
      user: { ...USER, email: 'mona@example.edu', name: 'Mona', emailVerified: true } as never,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      { tenantId: USER.tenantId, userId: USER.id },
      { action: 'auth.password_reset', targetId: USER.id },
    );
  });

  it('logs a failing audit without the error text and does not throw', async () => {
    mocks.recordAudit.mockRejectedValue(new TypeError('mona@example.edu'));
    await expect(recordPasswordReset(USER)).resolves.toBeUndefined();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.password_reset_audit_failed', {
      errorName: 'TypeError',
      sqlState: null,
    });
  });

  it('logs the SQLSTATE of a failing database write', async () => {
    mocks.recordAudit.mockRejectedValue(
      Object.assign(new Error('insert failed for mona@example.edu'), { code: '40001' }),
    );
    await expect(recordPasswordReset(USER)).resolves.toBeUndefined();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.password_reset_audit_failed', {
      errorName: 'Error',
      sqlState: '40001',
    });
  });

  it('records nothing for a user without a college', async () => {
    await expect(recordPasswordReset({ id: USER.id })).resolves.toBeUndefined();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('auth.password_reset_audit_failed', {
      errorName: 'MissingTenant',
    });
  });
});
