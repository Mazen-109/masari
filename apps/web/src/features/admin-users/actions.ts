'use server';

import { sessions, users, type UserSummary } from '@masari/db';
import { revalidatePath } from 'next/cache';
import { parseForm } from '@/lib/form';
import { LOCALES } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { log } from '@/server/log';
import { canActOnUser } from './rules';
import { changeRoleSchema, setStatusSchema } from './schemas';

/**
 * Row actions of the People screen (contracts/server-actions.md §5.3; FR-030, FR-031, FR-044). `users` and
 * `sessions` are global tables reached through the pool: every users function used here is scoped to the
 * caller's college by its tenantId argument, and the audit row is written right after the change succeeds
 * (contracts/server-actions.md §1 "Audit and transactions"). Nothing but event names, error class names,
 * SQLSTATEs, and counts is logged — never a name or an email.
 */

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** The SQLSTATE of a database error (also when wrapped as `cause`), for the log; null when there is none. */
function sqlStateOf(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && SQLSTATE.test(current.code)) {
      return current.code;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return null;
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
  if (changed.from !== changed.to) {
    await recordAudit(ctx, {
      action: 'user.role_changed',
      targetId: userId,
      metadata: { from: changed.from, to: changed.to },
    });
  }
  return ok(undefined);
}

/**
 * Changes the role of another account of the caller's college (contracts/server-actions.md §5.3; FR-030).
 * The new role applies from that user's next request: every request reads the role afresh. The own account
 * → `forbidden`; another college's account or an unknown id → `not_found`, and nothing changes. Audit
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
  if (result.ok) revalidateUsersScreens();
  return result;
}

/**
 * Validate → target → change → audit → end the sessions. Suspending ends every session of the account:
 * also when it was already suspended (a retry after a failed revocation finishes the job), but only a real
 * change is audited. Reactivating never touches sessions: the ones ended by the suspension are deleted
 * rows, so nothing can bring them back — the user signs in again.
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

  if (target.user.status !== status) {
    if (!(await users.setStatus(ctx.tenant.id, userId, status))) return fail('not_found');
    await recordAudit(ctx, {
      action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
      targetId: userId,
    });
  }
  // After the status change: a sign-in racing with it either ends before (its session is deleted here) or
  // after (it reads the suspended status and is refused). Every request also re-reads the status.
  if (status === 'suspended') {
    const revoked = await sessions.revokeAllForUser(userId);
    log.info('admin.user_sessions_revoked', { count: revoked });
  }
  return ok(undefined);
}

/**
 * Suspends or reactivates another account of the caller's college (contracts/server-actions.md §5.3;
 * FR-031): suspending ends all of its sessions at once and sign-in is refused with `account_suspended`;
 * reactivating restores sign-in. The own account → `forbidden`; another college's account or an unknown id
 * → `not_found`, and nothing changes. Audit `user.suspended` / `user.reactivated`.
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
