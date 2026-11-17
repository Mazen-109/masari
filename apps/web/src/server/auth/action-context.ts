import { fail, type ActionResult } from '@/lib/result';
import { can, type Permission } from '@/server/auth/permissions';
import { getSessionContext, type SessionContext } from '@/server/auth/session';

/**
 * Guard for signed-in Server Actions (contracts/server-actions.md §1). Step (1) of every such action:
 *
 * ```ts
 * const guard = await getActionContext('admin.users.manage');
 * if ('failure' in guard) return guard.failure;
 * ```
 *
 * `unauthenticated` without a usable session (none, suspended user, or suspended college);
 * `forbidden` when a permission is given and the role does not hold it.
 */
export async function getActionContext(
  permission?: Permission,
): Promise<{ ctx: SessionContext } | { failure: ActionResult<never> }> {
  const ctx = await getSessionContext();
  if (ctx === null) return { failure: fail('unauthenticated') };
  if (permission !== undefined && !can(ctx.user.role, permission)) {
    return { failure: fail('forbidden') };
  }
  return { ctx };
}
