'use server';

import {
  divisions,
  sessions,
  studentProfiles,
  tenants,
  users,
  withTenant,
  type UserSummary,
} from '@masari/db';
import { revalidatePath } from 'next/cache';
import { isDivisionSelectable, isLevelAllowed } from '@/features/profile/rules';
import { formFields, parseForm } from '@/lib/form';
import { LOCALES } from '@/lib/locale';
import { fail, ok, type ActionResult, type FieldErrorCode } from '@/lib/result';
import { recordAudit, type AuditAction, type AuditEvent } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { errorName, sqlStateOf } from '@/server/errors';
import { log } from '@/server/log';
import { canActOnUser, changedStudentFields } from './rules';
import { adminStudentProfileSchema, changeRoleSchema, setStatusSchema } from './schemas';

/**
 * Row actions of the People screen (contracts/server-actions.md §5.3; FR-030, FR-031, FR-044). `users` and
 * `sessions` are global tables reached through the pool: every users function used here is scoped to the
 * caller's college by its tenantId argument, and the audit row is written right after the change succeeds
 * (contracts/server-actions.md §1 "Audit and transactions"). Nothing but event names, error class names,
 * SQLSTATEs, and counts is logged — never a name or an email.
 */

/**
 * The audit row of a change already made through the pool (`users`, `sessions`). When it cannot be written
 * the change stays, so the failure is logged under its own event name only — no personal data — and the
 * action answers `internal` (contracts/server-actions.md §1 "Audit and transactions").
 */
async function auditAfterChange<A extends AuditAction>(
  ctx: SessionContext,
  event: AuditEvent<A>,
): Promise<ActionResult | null> {
  try {
    await recordAudit(ctx, event);
    return null;
  } catch (error) {
    log.error('admin.user_audit_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    return fail('internal');
  }
}

/** The People screen, in both languages. */
function revalidateUsersScreens(): void {
  for (const locale of LOCALES) revalidatePath(`/${locale}/admin/users`);
}

type Target = { ok: true; user: UserSummary } | { ok: false; result: ActionResult };

/**
 * The account the form names, after the two refusals every row action shares: the administrator's own
 * account → `forbidden`; an account the caller's college does not have (unknown id, another college's
 * account) → `not_found`.
 */
async function findTarget(ctx: SessionContext, userId: string): Promise<Target> {
  if (!canActOnUser(ctx.user.id, userId)) return { ok: false, result: fail('forbidden') };
  const user = await users.findInTenant(ctx.tenant.id, userId);
  return user === null ? { ok: false, result: fail('not_found') } : { ok: true, user };
}

/** Validate → target → change → audit. An unchanged role is a success that changes and audits nothing. */
async function changeRole(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(changeRoleSchema, formData);
  if (!parsed.ok) {
    // The id comes from a hidden field: a missing or malformed one names no account.
    const fieldErrors = parsed.failure.ok ? undefined : parsed.failure.fieldErrors;
    return fieldErrors?.userId === undefined ? parsed.failure : fail('not_found');
  }
  const { userId, role } = parsed.data;

  const target = await findTarget(ctx, userId);
  if (!target.ok) return target.result;
  if (target.user.role === role) return ok(undefined);

  const changed = await users.setRole(ctx.tenant.id, userId, role);
  if (changed === null) return fail('not_found');
  // The college's last active administrator: only possible when the caller lost the role (or was
  // suspended) at the same moment, so the caller no longer may act (spec.md "Last administrator").
  if (changed === 'last_admin') return fail('forbidden');
  if (changed.from !== changed.to) {
    const failed = await auditAfterChange(ctx, {
      action: 'user.role_changed',
      targetId: userId,
      metadata: { from: changed.from, to: changed.to },
    });
    if (failed !== null) return failed;
  }
  return ok(undefined);
}

/**
 * Changes the role of another account of the caller's college (contracts/server-actions.md §5.3; FR-030).
 * The new role applies from that user's next request: every request reads the role afresh. The own account
 * → `forbidden`; another college's account or an unknown id → `not_found`, and nothing changes. Taking
 * the role from the college's last active administrator → `forbidden`, nothing changes. Audit
 * `user.role_changed {from,to}`.
 */
export async function changeUserRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.users.manage');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await changeRole(guard.ctx, formData);
  } catch (error) {
    log.error('admin.user_role_change_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  // Also after an unexpected failure: the role may have changed before it (the list must show it).
  if (result.ok || result.code === 'internal') revalidateUsersScreens();
  return result;
}

/**
 * Validate → target → change → end the sessions → audit. Suspending ends every session of the account
 * right after the status change and before the audit row, so it holds at once even when the audit write
 * fails (FR-031); also when the account was already suspended (a retry after a failed revocation finishes
 * the job), but only a real change is audited — also when the revocation failed, which then answers
 * `internal`. Reactivating never touches sessions: the ones ended by the
 * suspension are deleted rows, so nothing can bring them back — the user signs in again.
 */
async function setStatus(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(setStatusSchema, formData);
  if (!parsed.ok) {
    const fieldErrors = parsed.failure.ok ? undefined : parsed.failure.fieldErrors;
    return fieldErrors?.userId === undefined ? parsed.failure : fail('not_found');
  }
  const { userId, status } = parsed.data;

  const target = await findTarget(ctx, userId);
  if (!target.ok) return target.result;

  const changes = target.user.status !== status;
  if (changes) {
    const updated = await users.setStatus(ctx.tenant.id, userId, status);
    // The college's last active administrator (see changeRole): nothing changed, no session is ended.
    if (updated === 'last_admin') return fail('forbidden');
    if (!updated) return fail('not_found');
  }
  // After the status change: a sign-in racing with it either ends before (its session is deleted here) or
  // after (it reads the suspended status and is refused). Every request also re-reads the status.
  let revocationError: { error: unknown } | null = null;
  if (status === 'suspended') {
    try {
      const revoked = await sessions.revokeAllForUser(userId);
      log.info('admin.user_sessions_revoked', { count: revoked });
    } catch (error) {
      // The status did change: it is still audited (a retry finds it unchanged and would not audit it).
      revocationError = { error };
    }
  }
  const auditFailure = changes
    ? await auditAfterChange(ctx, {
        action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
        targetId: userId,
      })
    : null;
  // Logged by the caller as a failed status change (an audit failure was logged above).
  if (revocationError !== null) throw revocationError.error;
  return auditFailure ?? ok(undefined);
}

/**
 * Suspends or reactivates another account of the caller's college (contracts/server-actions.md §5.3;
 * FR-031): suspending ends all of its sessions at once and sign-in is refused with `account_suspended`;
 * reactivating restores sign-in. The own account → `forbidden`; another college's account or an unknown id
 * → `not_found`, and nothing changes. Suspending the college's last active administrator → `forbidden`,
 * nothing changes. Audit `user.suspended` / `user.reactivated`.
 */
export async function setUserStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.users.manage');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await setStatus(guard.ctx, formData);
  } catch (error) {
    log.error('admin.user_status_change_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  // Also after an unexpected failure: the status may have changed before it (the list must show it).
  if (result.ok || result.code === 'internal') revalidateUsersScreens();
  return result;
}

// ---------------------------------------------------------------------------------------------------------
// The academic-data dialog (FR-028)

/** Fields echoed back after a failure (`meta.<field>`) so the dialog is re-filled; never the user id. */
const PROFILE_ENTERED_FIELDS = ['studentCode', 'level', 'divisionId'] as const;
/** Long enough for any valid value. */
const MAX_ENTERED_LENGTH = 120;

type ProfileField = (typeof PROFILE_ENTERED_FIELDS)[number];

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

function invalid(field: ProfileField, code: FieldErrorCode): ActionResult {
  return fail('validation', { fieldErrors: { [field]: code } });
}

/** The People screen and the screens that show a student's academic data, in both languages. */
function revalidateStudentScreens(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/users`);
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/profile`);
  }
}

/**
 * Validate → target (a student of the caller's college) → the student form's college rules → create or
 * change the profile, with its audit row, in one withTenant transaction (the administrator is the actor),
 * which first re-reads and locks the target's role (still a student of the college, else `not_found`)
 * and checks the level against the college row locked FOR SHARE (tenants.findCurrentForShare). A missing profile is created (`profile.created`); otherwise only the fields that differ are written and
 * listed in `profile.updated {fields}`; nothing differs → `ok`, no write, no audit row.
 */
async function updateStudentProfile(
  ctx: SessionContext,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(adminStudentProfileSchema, formData);
  if (!parsed.ok) {
    const fieldErrors = parsed.failure.ok ? undefined : parsed.failure.fieldErrors;
    return fieldErrors?.userId === undefined ? parsed.failure : fail('not_found');
  }
  const { userId, ...input } = parsed.data;

  // Only a student of the caller's college: staff (the administrator included) and other colleges'
  // accounts are unknown here.
  const target = await users.findInTenant(ctx.tenant.id, userId);
  if (target?.role !== 'student') return fail('not_found');

  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    // Again in the transaction, holding the account until it ends: a role change made since the first
    // read is seen here, and one made from now on waits for this write.
    if ((await users.lockRoleInTenant(tx, ctx.tenant.id, userId)) !== 'student') {
      return fail('not_found');
    }
    const current = await studentProfiles.findByUserId(tx, userId);
    // The number of levels read in this transaction and held until it ends (FR-032): a settings save
    // that lowers it waits for this write and then counts the level written here.
    const college = await tenants.findCurrentForShare(tx);
    if (college === null) return fail('not_found');
    if (!isLevelAllowed(input.level, college.levelsCount)) return invalid('level', 'out_of_range');
    const division = await divisions.findById(tx, input.divisionId);
    if (division === null || !isDivisionSelectable(division, current?.divisionId ?? null)) {
      return invalid('divisionId', 'invalid_choice');
    }

    if (current === null) {
      const created = await studentProfiles.create(tx, {
        userId,
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
            // The student completed the profile at the same moment: nothing is overwritten.
            return fail('conflict');
          case 'user_not_in_tenant':
            return fail('not_found');
        }
      }
      await recordAudit(ctx, { action: 'profile.created', targetId: userId }, tx);
      return ok(undefined);
    }

    const patch = changedStudentFields(current, { ...input, divisionId: division.id });
    const fields = Object.keys(patch);
    if (fields.length === 0) return ok(undefined);

    const updated = await studentProfiles.update(tx, userId, patch);
    if (!updated.ok) {
      switch (updated.reason) {
        case 'student_code_taken':
          return invalid('studentCode', 'student_code_taken');
        case 'invalid_division':
          return invalid('divisionId', 'invalid_choice');
        case 'not_found':
          return fail('not_found');
      }
    }
    await recordAudit(
      ctx,
      { action: 'profile.updated', targetId: userId, metadata: { fields } },
      tx,
    );
    return ok(undefined);
  });
}

/**
 * Corrects a student's code, level, and division (contracts/server-actions.md §5.3; FR-028, FR-044), under
 * the same rules as the student's own form: code 3–20 Latin letters, digits, hyphens, unique in the
 * college (`student_code_taken`); level up to the college's number of levels; an active division, or the
 * student's current one. Creates the profile when the student has none yet. A target that is not a
 * student of the caller's college → `not_found`, and nothing changes. The student code is never logged.
 */
export async function adminUpdateStudentProfileAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.users.manage');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await updateStudentProfile(guard.ctx, formData);
  } catch (error) {
    log.error('admin.student_profile_update_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  if (result.ok) revalidateStudentScreens();
  return withEnteredValues(result, formData);
}
