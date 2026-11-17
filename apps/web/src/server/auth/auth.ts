import { authSchema, getAuthDb } from '@masari/db/auth';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { logAuthLibrary } from '@/server/auth/library-logger';
import { sendEmail, type EmailTemplateName } from '@/server/email/send';
import type { RenderedEmail } from '@/server/email/templates/layout';
import { resetPassword } from '@/server/email/templates/reset-password';
import { verifyEmail } from '@/server/email/templates/verify-email';
import { getEnv, type Env } from '@/server/env';
import { log } from '@/server/log';

/**
 * The Better Auth instance (research.md §7, FR-004, FR-007, FR-008, FR-010). Created lazily on the first
 * getAuth() call: importing this module reads no environment variable and opens no connection
 * (contracts/http-and-env.md §3), so `next build` runs with an empty environment.
 *
 * Server code calls `getAuth().api.*`; the HTTP handler is reachable only through the allow-list of
 * `allowed-paths.ts`. This is the only file allowed to import `@masari/db/auth` (ESLint).
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Drizzle adapter settings: plural table names; a user and its credential account are created atomically. */
export const DRIZZLE_ADAPTER_OPTIONS = {
  provider: 'pg',
  schema: authSchema,
  usePlural: true,
  transaction: true,
} as const satisfies Parameters<typeof drizzleAdapter>[1];

/**
 * Sends a library email. Failures are logged (template name only) and re-thrown; callers that must not
 * reveal whether an account exists catch them (research.md §8).
 */
async function deliver(
  template: EmailTemplateName,
  to: string,
  rendered: RenderedEmail,
): Promise<void> {
  try {
    await sendEmail({ template, to, ...rendered });
    log.info('email.sent', { template });
  } catch (error) {
    log.error('email.failed', { template });
    throw error;
  }
}

/** Every option of research.md §7; pure apart from the hooks, so the settings are unit-tested. */
export function authOptions(
  env: Pick<Env, 'APP_URL' | 'BETTER_AUTH_SECRET'>,
  database: ReturnType<typeof drizzleAdapter>,
) {
  return {
    appName: 'Masari',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Registration never signs in: the account must be confirmed first (spec D5).
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await deliver('reset-password', user.email, resetPassword({ name: user.name, url }));
      },
    },
    emailVerification: {
      // Masari's registration action sends the confirmation itself (research.md §8).
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => {
        await deliver('verify-email', user.email, verifyEmail({ name: user.name, url }));
      },
    },
    // Stored one-time values (password-reset tokens) are kept only as hashes, like invitation tokens.
    verification: { storeIdentifier: 'hashed' },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Every request reads the session from the database, so suspension takes effect at once.
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        tenantId: { type: 'string', required: true, input: true },
        locale: { type: 'string', required: false, defaultValue: 'ar', input: true },
        privacyConsentAt: { type: 'date', required: false, input: true },
        // Never settable through the auth API: changed only by administrators via repositories.
        role: { type: 'string', required: false, defaultValue: 'student', input: false },
        status: { type: 'string', required: false, defaultValue: 'active', input: false },
      },
    },
    advanced: {
      // The library can only trust a single-entry X-Forwarded-For or a list of proxy addresses, not the
      // hop count of contracts/http-and-env.md §5, so it records no client address at all
      // (sessions.ip_address stays NULL). Masari's own limiter and audit use getClientIp().
      ipAddress: { disableIpTracking: true },
    },
    // Only the level reaches log.ts; messages and error objects (which can hold emails) are dropped.
    // `level` is deliberately not set (see library-logger.ts).
    logger: { log: logAuthLibrary },
    telemetry: { enabled: false },
    // nextCookies() must be the last plugin (it sets cookies from Server Actions).
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}

function createAuth() {
  return betterAuth(authOptions(getEnv(), drizzleAdapter(getAuthDb(), DRIZZLE_ADAPTER_OPTIONS)));
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/**
 * The memoised auth instance, created on first call. It keeps the Drizzle instance (and so the runtime
 * pool) captured at creation: after `closePool()` — tests and scripts only — it would still use the closed
 * pool, so a process that closes the pool must not call getAuth() again.
 */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
