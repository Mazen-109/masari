'use server';

import { invitations, users, withTenant } from '@masari/db';
import { revalidatePath } from 'next/cache';
import { formFields, parseForm } from '@/lib/form';
import { LOCALES } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { sendEmail } from '@/server/email/send';
import { invitation as invitationEmail } from '@/server/email/templates/invitation';
import { getEnv } from '@/server/env';
import { errorName, sqlStateOf } from '@/server/errors';
import { log } from '@/server/log';
import { enforceRateLimit, rateLimitRules } from '@/server/rate-limit';
import {
  createInvitationSchema,
  revokeInvitationSchema,
  type CreateInvitationInput,
} from './schemas';

/** Invitation actions of the administration (contracts/server-actions.md §5.2). */

/** Fields echoed back after a failure (`meta.<field>`), so the form is re-filled also without JavaScript. */
const INVITE_ENTERED_FIELDS = ['email', 'role'] as const;
const MAX_ENTERED_LENGTH = 254;

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

/** The one answer for "has an account" and "already invited" (FR-005, FR-020). */
const EMAIL_UNAVAILABLE = fail('validation', { fieldErrors: { email: 'email_unavailable' } });

type Created = { ok: true; invitationId: string; token: string } | { ok: false };

/**
 * The checks and the insert, with the audit row, in one withTenant transaction. Both refusals do the same
 * work — the account lookup and the pending-invitation lookup always run — so "has an account" and "already
 * invited" cannot be told apart by their answer or by their timing. A concurrent create of the same address
 * ends as `pending_exists` (the repository's ON CONFLICT DO NOTHING), which is the same refusal.
 */
async function insertInvitation(
  ctx: SessionContext,
  input: CreateInvitationInput,
): Promise<Created> {
  const hasAccount = (await users.findByEmail(input.email)) !== null;
  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const alreadyInvited = await invitations.hasUsablePending(tx, input.email);
    if (hasAccount || alreadyInvited) return { ok: false };
    const created = await invitations.create(tx, {
      email: input.email,
      role: input.role,
      invitedBy: ctx.user.id,
    });
    if (!created.ok) return { ok: false };
    await recordAudit(
      ctx,
      {
        action: 'invitation.created',
        targetId: created.value.id,
        metadata: { role: input.role },
      },
      tx,
    );
    return { ok: true, invitationId: created.value.id, token: created.token };
  });
}

/**
 * Sends the `invitation` email (contracts/emails.md §3) with the link `{APP_URL}/ar/invite/{token}`.
 * Returns false when the transport fails. Only the template and the invitation id are logged — never the
 * address, the link, or the token.
 */
async function sendInvitationEmail(
  ctx: SessionContext,
  input: CreateInvitationInput,
  created: { invitationId: string; token: string },
): Promise<boolean> {
  const { APP_URL } = getEnv();
  const message = invitationEmail({
    collegeNameAr: ctx.tenant.nameAr,
    collegeNameEn: ctx.tenant.nameEn,
    role: input.role,
    url: `${APP_URL}/ar/invite/${created.token}`,
  });
  try {
    await sendEmail({ template: 'invitation', to: input.email, ...message });
    log.info('email.sent', { template: 'invitation', invitationId: created.invitationId });
    return true;
  } catch (error) {
    log.error('email.failed', {
      template: 'invitation',
      invitationId: created.invitationId,
      errorName: errorName(error),
    });
    return false;
  }
}

/** Validate → rate limit → checks + insert + audit → email. */
async function createInvitation(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(createInvitationSchema, formData);
  if (!parsed.ok) return parsed.failure;
  const input = parsed.data;

  const limited = await enforceRateLimit(rateLimitRules('invite-create', { user: ctx.user.id }));
  if (limited) return limited;

  const created = await insertInvitation(ctx, input);
  if (!created.ok) return EMAIL_UNAVAILABLE;

  // A failed email leaves the invitation pending (contracts/server-actions.md §5.2): the administrator
  // sees it in the list, revokes it, and invites again.
  return (await sendInvitationEmail(ctx, input, created)) ? ok(undefined) : fail('internal');
}

/** The invitations screen, in both languages. */
function revalidateInvitationScreens(): void {
  for (const locale of LOCALES) revalidatePath(`/${locale}/admin/invitations`);
}

/**
 * Invites an email address to the college with one of the four roles (contracts/server-actions.md §5.2;
 * FR-020, FR-044). An address that already has an account (in any college) and one with a usable pending
 * invitation in this college get the same `email_unavailable`; an expired pending invitation is replaced.
 * At most 60 invitations per administrator per hour. Audit `invitation.created {role}`. The address is
 * never logged; an unexpected failure is logged with the error class and SQLSTATE only.
 */
export async function createInvitationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.invitations.manage');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await createInvitation(guard.ctx, formData);
  } catch (error) {
    log.error('invitation.create_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  // Also after a failed email: the new pending invitation is in the list.
  if (result.ok || result.code === 'internal') revalidateInvitationScreens();
  return withEnteredValues(result, formData, INVITE_ENTERED_FIELDS);
}

/**
 * Revokes the pending invitation in one withTenant transaction with its audit row. Row-level security
 * limits the update to the caller's college, so another college's id is answered like an unknown one.
 */
async function revokeInvitation(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(revokeInvitationSchema, formData);
  // The id comes from a hidden field: a missing or malformed one names no invitation.
  if (!parsed.ok) return fail('not_found');
  const { invitationId } = parsed.data;

  const outcome = await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const revoked = await invitations.revoke(tx, invitationId);
    if (revoked === 'revoked') {
      await recordAudit(ctx, { action: 'invitation.revoked', targetId: invitationId }, tx);
    }
    return revoked;
  });
  if (outcome === 'revoked') return ok(undefined);
  return outcome === 'not_pending' ? fail('conflict') : fail('not_found');
}

/**
 * Revokes a pending invitation of the caller's college (contracts/server-actions.md §5.2; FR-022, FR-044):
 * its link stops working at once. An unknown id or one of another college → `not_found`; an invitation
 * already accepted or revoked → `conflict`. Audit `invitation.revoked`. Nothing but the error class and
 * SQLSTATE of an unexpected failure is logged.
 */
export async function revokeInvitationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.invitations.manage');
  if ('failure' in guard) return guard.failure;

  let result: ActionResult;
  try {
    result = await revokeInvitation(guard.ctx, formData);
  } catch (error) {
    log.error('invitation.revoke_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  // `conflict`: the list on screen is out of date, so it is refreshed too.
  if (result.ok || result.code === 'conflict') revalidateInvitationScreens();
  return result;
}
