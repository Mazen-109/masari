'use server';

import { tenants, users } from '@masari/db';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { parseForm } from '@/lib/form';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getAuth } from '@/server/auth/auth';
import { sendEmail } from '@/server/email/send';
import { accountExists } from '@/server/email/templates/account-exists';
import { getEnv } from '@/server/env';
import { log } from '@/server/log';
import { enforceRateLimit, rateLimitRules } from '@/server/rate-limit';
import { getClientIp } from '@/server/request';
import { isEmailDomainAllowed } from './rules';
import { registerSchema, type RegisterInput } from './schemas';

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

/** Non-secret fields echoed back on a failure (never the password), at most this many characters each. */
const ENTERED_FIELDS = ['tenantSlug', 'name', 'email', 'consent'] as const;
const MAX_ENTERED_LENGTH = 254;

/**
 * A failure plus what the user typed in the non-secret fields (`meta.tenantSlug`, `meta.name`,
 * `meta.email`, `meta.consent`), so the form is re-filled also when JavaScript is off and the page is
 * rendered from the action state. The password is never returned.
 */
function withEnteredValues(result: ActionResult, formData: FormData): ActionResult {
  if (result.ok) return result;
  const meta: Record<string, string | number> = { ...result.meta };
  for (const key of ENTERED_FIELDS) {
    const value = formData.get(key);
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
  return withEnteredValues(result, formData);
}
