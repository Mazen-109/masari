'use server';

import { divisions, studentProfiles, users, withTenant } from '@masari/db';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { formFields, parseForm } from '@/lib/form';
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@/lib/locale';
import { fail, ok, type ActionResult, type FieldErrorCode } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { log } from '@/server/log';
import { isDivisionSelectable, isLevelAllowed } from './rules';
import { studentProfileSchema } from './schemas';

/** Account and academic-profile actions (contracts/server-actions.md §5.1). */

const localeSchema = z.enum(LOCALES);

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The SQLSTATE an error carries in its own `code` (e.g. StudentProfileQueryError), for the log: five
 * characters, never personal data. null when there is none.
 */
function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  return typeof code === 'string' && SQLSTATE.test(code) ? code : null;
}

async function currentLocale(): Promise<Locale> {
  const locale = await getLocale();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Remembers the signed-in user's language with the account (FR-037): sign-in on any device then lands in
 * it. Called directly by the language switch, which navigates afterwards whatever the answer — the switch
 * itself never depends on this call. No audit: a display preference, not a change to college data.
 */
export async function setLocaleAction(locale: unknown): Promise<ActionResult> {
  const guard = await getActionContext();
  if ('failure' in guard) return guard.failure;

  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return fail('validation', { fieldErrors: { locale: 'invalid_choice' } });

  try {
    if (guard.ctx.user.locale !== parsed.data)
      await users.setLocale(guard.ctx.user.id, parsed.data);
  } catch (error) {
    log.error('profile.set_locale_failed', { errorName: errorName(error) });
    return fail('internal');
  }
  return ok(undefined);
}

/** Fields echoed back after a failure (`meta.<field>`) so the form is re-filled, also without JavaScript. */
const PROFILE_ENTERED_FIELDS = ['studentCode', 'level', 'divisionId'] as const;
const MAX_ENTERED_LENGTH = 64;

function withEnteredValues(result: ActionResult, formData: FormData): ActionResult {
  if (result.ok) return result;
  const fields = formFields(formData);
  const meta: Record<string, string | number> = { ...result.meta };
  for (const key of PROFILE_ENTERED_FIELDS) {
    const value = fields[key];
    if (typeof value === 'string') meta[key] = value.slice(0, MAX_ENTERED_LENGTH);
  }
  return { ...result, meta };
}

function invalid(
  field: (typeof PROFILE_ENTERED_FIELDS)[number],
  code: FieldErrorCode,
): ActionResult {
  return fail('validation', { fieldErrors: { [field]: code } });
}

/**
 * Profile exists? → validate → college rules → create, with its audit row, in one withTenant transaction.
 * `ok` means "go to the dashboard". A profile that already exists — checked first, and again by the
 * repository's `already_exists` for a concurrent submit — is also `ok`: a double submit or a resubmit
 * from the back button simply lands on the dashboard, without a second audit row. Existence is read in
 * the transaction, never from the session context, which is cached for the request.
 */
async function completeProfile(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    if ((await studentProfiles.findByUserId(tx, ctx.user.id)) !== null) return ok(undefined);

    const parsed = parseForm(studentProfileSchema, formData);
    if (!parsed.ok) return parsed.failure;
    const input = parsed.data;

    if (!isLevelAllowed(input.level, ctx.tenant.levelsCount)) {
      return invalid('level', 'out_of_range');
    }
    const division = await divisions.findById(tx, input.divisionId);
    if (division === null || !isDivisionSelectable(division, null)) {
      return invalid('divisionId', 'invalid_choice');
    }
    const created = await studentProfiles.create(tx, {
      userId: ctx.user.id,
      studentCode: input.studentCode,
      level: input.level,
      divisionId: division.id,
    });
    if (!created.ok) {
      switch (created.reason) {
        case 'student_code_taken':
          return invalid('studentCode', 'student_code_taken');
        case 'invalid_division':
          return invalid('divisionId', 'invalid_choice');
        case 'already_exists':
          return ok(undefined);
        case 'user_not_in_tenant':
          // The account no longer belongs to the session's college.
          return fail('forbidden');
      }
    }
    await recordAudit(ctx, { action: 'profile.created', targetId: ctx.user.id }, tx);
    return ok(undefined);
  });
}

/**
 * The mandatory profile step of a new student (contracts/server-actions.md §5.1; FR-024–FR-026, FR-044):
 * student code (unique in the college), level (≤ the college's number of levels), and an active division
 * of the college. On success goes to the dashboard, which reads the profile afresh (requireSession).
 * The student code is personal data: it is never logged; an unexpected failure is logged with the error
 * class and, for a database error, its SQLSTATE only.
 */
export async function completeStudentProfileAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('profile.academic.manage_own');
  if ('failure' in guard) return guard.failure;
  const locale = await currentLocale();

  let result: ActionResult;
  try {
    result = await completeProfile(guard.ctx, formData);
  } catch (error) {
    unstable_rethrow(error);
    log.error('profile.complete_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  if (result.ok) redirect(`/${locale}/dashboard`);
  return withEnteredValues(result, formData);
}
