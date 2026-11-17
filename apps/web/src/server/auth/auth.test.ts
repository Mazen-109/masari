import { describe, expect, it } from 'vitest';
import { authOptions, DRIZZLE_ADAPTER_OPTIONS } from './auth';

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
