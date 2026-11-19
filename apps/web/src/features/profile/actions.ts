'use server';

import { divisions, studentProfiles, tenants, users, withTenant, type Tx } from '@masari/db';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { formFields, parseForm } from '@/lib/form';
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@/lib/locale';
import { fail, ok, type ActionResult, type FieldErrorCode } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { errorName, sqlStateOf } from '@/server/errors';
import { log } from '@/server/log';
import { changedProfileFields, isDivisionSelectable, isLevelAllowed } from './rules';
import { accountSchema, studentProfileSchema, studentProfileUpdateSchema } from './schemas';

/** Account and academic-profile actions (contracts/server-actions.md §5.1). */

const localeSchema = z.enum(LOCALES);

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

/**
 * Fields echoed back after a failure (`meta.<field>`) so the form is re-filled, also without JavaScript.
 * Each form echoes only its own fields: a forged extra field is never sent back.
 */
const PROFILE_ENTERED_FIELDS = ['studentCode', 'level', 'divisionId'] as const;
const PROFILE_UPDATE_ENTERED_FIELDS = ['level', 'divisionId'] as const;
const ACCOUNT_ENTERED_FIELDS = ['name'] as const;
/** Long enough for any valid value (a name has at most 100 characters). */
const MAX_ENTERED_LENGTH = 120;

type ProfileField = (typeof PROFILE_ENTERED_FIELDS)[number];

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

function invalid(field: ProfileField, code: FieldErrorCode): ActionResult {
  return fail('validation', { fieldErrors: { [field]: code } });
}

/** The screens that show the name and the academic profile, in both languages. */
function revalidateProfileScreens(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/profile`);
    revalidatePath(`/${locale}/dashboard`);
  }
}

/**
 * The level rule (FR-024, FR-032) against the college's number of levels read in the caller's transaction
 * and locked FOR SHARE until it ends, never the request's cached copy: a settings save that lowers the
 * number waits for this profile write and then counts its level, and one that came first is seen here.
 */
async function isLevelAllowedNow(tx: Tx, level: number): Promise<boolean> {
  const college = await tenants.findCurrentForShare(tx);
  return college !== null && isLevelAllowed(level, college.levelsCount);
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

    if (!(await isLevelAllowedNow(tx, input.level))) return invalid('level', 'out_of_range');
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
  return withEnteredValues(result, formData, PROFILE_ENTERED_FIELDS);
}

/**
 * The account form of the profile screen (contracts/server-actions.md §5.1; FR-027): changes the signed-in
 * user's name. Any role. Unknown fields (email, role, status, …) are ignored. Not audited (the name is not
 * security-relevant, FR-044); the name is never logged.
 */
export async function updateAccountAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext();
  if ('failure' in guard) return guard.failure;

  const parsed = parseForm(accountSchema, formData);
  if (!parsed.ok) return withEnteredValues(parsed.failure, formData, ACCOUNT_ENTERED_FIELDS);

  try {
    if (parsed.data.name !== guard.ctx.user.name) {
      await users.setName(guard.ctx.user.id, parsed.data.name);
    }
  } catch (error) {
    log.error('profile.update_account_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    return withEnteredValues(fail('internal'), formData, ACCOUNT_ENTERED_FIELDS);
  }
  revalidateProfileScreens();
  return ok(undefined);
}

/**
 * Validate → current profile → college rules → change the fields that differ, with the audit row listing
 * them, in one withTenant transaction. Nothing changed → `ok`, no write, no audit row.
 */
async function updateProfile(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(studentProfileUpdateSchema, formData);
  if (!parsed.ok) return parsed.failure;
  const input = parsed.data;

  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const current = await studentProfiles.findByUserId(tx, ctx.user.id);
    if (current === null) return fail('not_found');

    if (!(await isLevelAllowedNow(tx, input.level))) return invalid('level', 'out_of_range');
    const division = await divisions.findById(tx, input.divisionId);
    if (division === null || !isDivisionSelectable(division, current.divisionId)) {
      return invalid('divisionId', 'invalid_choice');
    }

    const patch = changedProfileFields(current, { level: input.level, divisionId: division.id });
    const fields = Object.keys(patch);
    if (fields.length === 0) return ok(undefined);

    const updated = await studentProfiles.update(tx, ctx.user.id, patch);
    if (!updated.ok) {
      switch (updated.reason) {
        case 'not_found':
          return fail('not_found');
        case 'invalid_division':
          return invalid('divisionId', 'invalid_choice');
        case 'student_code_taken':
          // Cannot happen: the student code is never part of this patch.
          return fail('conflict');
      }
    }
    await recordAudit(
      ctx,
      { action: 'profile.updated', targetId: ctx.user.id, metadata: { fields } },
      tx,
    );
    return ok(undefined);
  });
}

/**
 * The academic part of the profile screen (contracts/server-actions.md §5.1; FR-026, FR-027, FR-044):
 * level (≤ the college's number of levels) and division (an active one, or the student's current one even
 * if deactivated since). The student code cannot be changed here: it is not a field of the schema, so a
 * forged `studentCode` (or `role`, `status`) is ignored. Audit `profile.updated {fields}` with the changed
 * fields only. The student code is never logged.
 */
export async function updateStudentProfileAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('profile.academic.manage_own');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await updateProfile(guard.ctx, formData);
  } catch (error) {
    log.error('profile.update_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  if (result.ok) revalidateProfileScreens();
  return withEnteredValues(result, formData, PROFILE_UPDATE_ENTERED_FIELDS);
}
