'use server';

import { sessions, tenants, users } from '@masari/db';
import { isAPIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { formFields, parseForm } from '@/lib/form';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getAuth } from '@/server/auth/auth';
import { getSessionContext } from '@/server/auth/session';
import { sendEmail } from '@/server/email/send';
import { accountExists } from '@/server/email/templates/account-exists';
import { getEnv } from '@/server/env';
import { log } from '@/server/log';
import { enforceRateLimit, rateLimitRules } from '@/server/rate-limit';
import { getClientIp } from '@/server/request';
import { isEmailDomainAllowed } from './rules';
import { registerSchema, resendSchema, signInSchema, type RegisterInput } from './schemas';

/** Public account actions (contracts/server-actions.md §4). */

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

async function currentLocale(): Promise<Locale> {
  const locale = await getLocale();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** "You already have an account" (contracts/emails.md §3); a failure is logged and swallowed (§4.1). */
async function sendAccountExists(to: string): Promise<void> {
  const { APP_URL } = getEnv();
  const message = accountExists({
    signInUrl: `${APP_URL}/ar/sign-in`,
    resetUrl: `${APP_URL}/ar/forgot-password`,
  });
  try {
    await sendEmail({ template: 'account-exists', to, ...message });
    log.info('email.sent', { template: 'account-exists' });
  } catch {
    log.error('email.failed', { template: 'account-exists' });
  }
}

/**
 * Step 7: creates the student account through the auth library (role and status keep their defaults),
 * sends the confirmation email, and audits `user.registered`. The library's returned id is not trusted
 * (research.md §7): the new account is read back by email and must belong to this college.
 */
async function createStudent(input: RegisterInput, tenantId: string, locale: Locale) {
  const auth = getAuth();
  const created = await auth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      tenantId,
      locale,
      privacyConsentAt: new Date(),
    },
  });
  const user = await users.findByEmail(input.email);
  if (user?.id !== created.user.id || user.tenantId !== tenantId) {
    // A concurrent registration for the same address created the account; this call created nothing.
    log.warn('auth.register_race');
    return;
  }

  try {
    // The library's hook logs email.sent / email.failed itself.
    await auth.api.sendVerificationEmail({
      body: { email: input.email, callbackURL: `/${locale}/email-verified` },
    });
  } catch (error) {
    // A transport failure is already logged as email.failed by the hook. The user can ask for a new
    // email on the next screen.
    log.warn('auth.verification_not_sent', { errorName: errorName(error) });
  }

  await recordAudit(
    { tenantId, userId: user.id },
    { action: 'user.registered', targetId: user.id },
  );
}

/** Non-secret fields echoed back on a failure (never a password), at most this many characters each. */
const REGISTER_ENTERED_FIELDS = ['tenantSlug', 'name', 'email', 'consent'] as const;
const RESEND_ENTERED_FIELDS = ['email'] as const;
const SIGN_IN_ENTERED_FIELDS = ['email'] as const;
const MAX_ENTERED_LENGTH = 254;

/**
 * A failure plus what the user typed in the listed non-secret fields (`meta.<field>`), so the form is
 * re-filled also when JavaScript is off and the page is rendered from the action state. Values are read
 * with `formFields`, exactly as `parseForm` read them (first value of a duplicated field), so the echo
 * always shows the value that was validated.
 */
function withEnteredValues(
  result: ActionResult,
  formData: FormData,
  keys: readonly string[],
): ActionResult {
  if (result.ok) return result;
  const fields = formFields(formData);
  const meta: Record<string, string | number> = { ...result.meta };
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string') meta[key] = value.slice(0, MAX_ENTERED_LENGTH);
  }
  return { ...result, meta };
}

/** Steps 1–8; `ok` means "go to the check-your-email screen" (step 9). */
async function register(formData: FormData, locale: Locale): Promise<ActionResult> {
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.ok) return parsed.failure;
  const input = parsed.data;

  const limited = await enforceRateLimit(
    rateLimitRules('register', { email: input.email, ip: await getClientIp() }),
  );
  if (limited) return limited;

  const tenant = await tenants.findBySlug(input.tenantSlug);
  if (tenant?.status !== 'active') {
    return fail('validation', { fieldErrors: { tenantSlug: 'invalid_choice' } });
  }
  if (!isEmailDomainAllowed(input.email, tenant.allowedEmailDomains)) {
    return fail('validation', {
      fieldErrors: { email: 'domain_not_allowed' },
      meta: { domains: tenant.allowedEmailDomains.join(', ') },
    });
  }

  if (await users.findByEmail(input.email)) {
    await sendAccountExists(input.email);
  } else {
    // Step 6 (pending invitation → `invitation-pending` email) is added in PR-29.
    await createStudent(input, tenant.id, locale);
  }
  return ok(undefined);
}

/**
 * Student self-registration (contracts/server-actions.md §4.1; FR-001…FR-005, FR-009, FR-011, FR-013).
 * A new address, an address that already has an account, and (from PR-29) one with a pending invitation
 * all end in the same redirect to the "check your email" screen.
 */
export async function registerStudentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const locale = await currentLocale();
  let result: ActionResult;
  try {
    result = await register(formData, locale);
  } catch (error) {
    unstable_rethrow(error);
    log.error('auth.register_failed', { errorName: errorName(error) });
    result = fail('internal');
  }
  if (result.ok) redirect(`/${locale}/verify-email`);
  return withEnteredValues(result, formData, REGISTER_ENTERED_FIELDS);
}

/** Validate → rate limit → send only to an existing, unconfirmed account → always `ok`. */
async function resend(formData: FormData, locale: Locale): Promise<ActionResult> {
  const parsed = parseForm(resendSchema, formData);
  if (!parsed.ok) return parsed.failure;
  const { email } = parsed.data;

  const limited = await enforceRateLimit(
    rateLimitRules('verify-resend', { email, ip: await getClientIp() }),
  );
  if (limited) return limited;

  const user = await users.findByEmail(email);
  if (user !== null && !user.emailVerified) {
    try {
      // The library's hook logs email.sent / email.failed itself.
      await getAuth().api.sendVerificationEmail({
        body: { email, callbackURL: `/${locale}/email-verified` },
      });
    } catch (error) {
      // Same answer as for an unknown address: a failure must not reveal that the account exists.
      log.warn('auth.verification_not_sent', { errorName: errorName(error) });
    }
  }
  return ok(undefined);
}

/**
 * "Send the confirmation email again" (contracts/server-actions.md §4.2; FR-004, FR-005, FR-009). The
 * result is the same whether the address is unknown, already confirmed, or waiting for confirmation, so
 * the form never reveals whether an account exists.
 */
export async function resendVerificationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const locale = await currentLocale();
  let result: ActionResult;
  try {
    result = await resend(formData, locale);
  } catch (error) {
    unstable_rethrow(error);
    log.error('auth.resend_failed', { errorName: errorName(error) });
    result = fail('internal');
  }
  return withEnteredValues(result, formData, RESEND_ENTERED_FIELDS);
}

/** The library refused the sign-in only because the address is not confirmed yet. */
function isEmailNotVerified(error: unknown): boolean {
  if (!isAPIError(error)) return false;
  const body: unknown = (error as { body?: unknown }).body;
  return typeof body === 'object' && body !== null && 'code' in body
    ? body.code === 'EMAIL_NOT_VERIFIED'
    : false;
}

/**
 * The `Cookie` request header that carries the cookies a library response set (`name=value` of every
 * `Set-Cookie`), so the session just created can be addressed in the same Server Action.
 */
function cookieHeaderFrom(responseHeaders: Headers): string {
  return responseHeaders
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0]?.trim() ?? '')
    .filter((pair) => pair.includes('=') && !pair.endsWith('='))
    .join('; ');
}

/** The library's sign-in, with its refusals turned into Masari's codes (step 3). */
async function signInWithLibrary(email: string, password: string) {
  try {
    const { headers: responseHeaders, response } = await getAuth().api.signInEmail({
      body: { email, password },
      returnHeaders: true,
      returnStatus: false,
    });
    return { ok: true as const, userId: response.user.id, responseHeaders };
  } catch (error) {
    if (isEmailNotVerified(error))
      return { ok: false as const, result: fail('email_not_verified') };
    if (isAPIError(error)) return { ok: false as const, result: fail('invalid_credentials') };
    throw error;
  }
}

type SignInOutcome = { ok: true; redirectTo: string } | { ok: false; result: ActionResult };

/** Steps 1–6 of contracts/server-actions.md §4.3; a success carries the redirect target. */
async function signIn(formData: FormData): Promise<SignInOutcome> {
  const parsed = parseForm(signInSchema, formData);
  if (!parsed.ok) return { ok: false, result: parsed.failure };
  const { email, password, next } = parsed.data;

  const limited = await enforceRateLimit(
    rateLimitRules('signin', { email, ip: await getClientIp() }),
  );
  if (limited) return { ok: false, result: limited };

  // Unknown address and wrong password take the same path and the same time: for an unknown address
  // the library hashes the given password anyway, and this action does no extra work for either.
  const signedIn = await signInWithLibrary(email, password);
  if (!signedIn.ok) return signedIn;

  // Step 4: the library does not know Masari's statuses. The account and college are read fresh.
  const user = await users.findById(signedIn.userId);
  const tenant = user === null ? null : await tenants.findById(user.tenantId);
  if (user === null || tenant === null || user.status !== 'active' || tenant.status !== 'active') {
    // End the session just created (and clear its cookie) through the library.
    await getAuth().api.signOut({
      headers: new Headers({ cookie: cookieHeaderFrom(signedIn.responseHeaders) }),
    });
    if (user === null || tenant === null) return { ok: false, result: fail('internal') };
    if (user.status !== 'active') {
      // A suspended account keeps no session anywhere.
      await sessions.revokeAllForUser(user.id);
      return { ok: false, result: fail('account_suspended') };
    }
    // Other sessions of a suspended college stay; they are refused on every request meanwhile.
    return { ok: false, result: fail('tenant_suspended') };
  }

  await recordAudit(
    { tenantId: tenant.id, userId: user.id },
    { action: 'auth.sign_in', targetId: user.id },
  );
  return {
    ok: true,
    redirectTo: next === null ? `/${user.locale}/dashboard` : `/${user.locale}${next}`,
  };
}

/**
 * Sign-in with email and password (contracts/server-actions.md §4.3; FR-006, FR-008, FR-009, FR-019).
 * A wrong password and an unknown address get the identical `invalid_credentials`; a correct password
 * of an unconfirmed address gets `email_not_verified` (the form then offers the resend form). On success
 * the user lands, in their own language, on `next` when it is safe, otherwise on the dashboard.
 */
export async function signInAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let outcome: SignInOutcome;
  try {
    outcome = await signIn(formData);
  } catch (error) {
    unstable_rethrow(error);
    log.error('auth.sign_in_failed', { errorName: errorName(error) });
    outcome = { ok: false, result: fail('internal') };
  }
  if (outcome.ok) redirect(outcome.redirectTo);
  return withEnteredValues(outcome.result, formData, SIGN_IN_ENTERED_FIELDS);
}

/**
 * Sign-out (contracts/server-actions.md §4.4; FR-008): audit `auth.sign_out`, end the session through
 * the library (which clears the cookie), then go to the sign-in screen. Without a usable session it only
 * redirects. A failing audit is logged and does not keep the user signed in.
 */
export async function signOutAction(): Promise<void> {
  const locale = await currentLocale();
  const ctx = await getSessionContext();
  if (ctx !== null) {
    try {
      await recordAudit(ctx, { action: 'auth.sign_out', targetId: ctx.user.id });
    } catch (error) {
      log.error('auth.sign_out_audit_failed', { errorName: errorName(error) });
    }
    try {
      await getAuth().api.signOut({ headers: await headers() });
    } catch (error) {
      log.error('auth.sign_out_failed', { errorName: errorName(error) });
    }
  }
  redirect(`/${locale}/sign-in`);
}
