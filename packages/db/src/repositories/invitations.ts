import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Invitation, InvitationView, Role } from '../constants';
import { isUuid, type Tx } from '../context';
import { invitations } from '../schema';
import { generateInvitationToken } from '../tokens';

/**
 * Invitations of the college in context (contracts/db-api.md §1.6, data-model.md §3.7; FR-020, FR-022).
 * Tenant-scoped: every function runs inside withTenant — except findByTokenHash, which runs inside
 * withInvitationToken — and the row-level-security policies limit it to the current college, so an id from
 * another college behaves exactly like an unknown id.
 *
 * No function returns the token hash. The plain token is returned once, by create, for the invitation link;
 * neither is ever logged.
 */

const LIST_LIMIT = 200;
const VALIDITY = sql`interval '7 days'`;
/** How long an unlinked claim counts as an acceptance in flight (users.deleteJustCreated's window). */
const CLAIM_IN_FLIGHT = sql`interval '10 minutes'`;

/** Every column except token_hash. */
const columns = {
  id: invitations.id,
  tenantId: invitations.tenantId,
  email: invitations.email,
  role: invitations.role,
  status: invitations.status,
  expiresAt: invitations.expiresAt,
  invitedBy: invitations.invitedBy,
  acceptedUserId: invitations.acceptedUserId,
  acceptedAt: invitations.acceptedAt,
  createdAt: invitations.createdAt,
};

const isPending = eq(invitations.status, 'pending');
const isUnexpired = sql`${invitations.expiresAt} > now()`;

export type InvitationCreateResult =
  { ok: true; value: Invitation; token: string } | { ok: false; reason: 'pending_exists' };

export type InvitationRevokeResult = 'revoked' | 'not_found' | 'not_pending';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates a pending invitation in the college in context (tenant_id from the column default), valid for
 * 7 days. An expired pending invitation for the same email is revoked first — without an
 * `invitation.revoked` audit row (contracts/db-api.md §1.6); a non-expired one gives
 * `pending_exists`. The pending-per-email rule is enforced by the partial unique index with ON CONFLICT DO
 * NOTHING (not a caught violation), so concurrent creates yield one invitation and the caller's transaction
 * stays usable (e.g. for an audit entry). Whether an account with this email exists is the caller's check.
 */
export async function create(
  tx: Tx,
  input: { email: string; role: Role; invitedBy: string | null },
): Promise<InvitationCreateResult> {
  const email = normaliseEmail(input.email);
  await tx
    .update(invitations)
    .set({ status: 'revoked' })
    .where(and(eq(invitations.email, email), isPending, sql`${invitations.expiresAt} <= now()`));
  const { token, tokenHash } = generateInvitationToken();
  const rows = await tx
    .insert(invitations)
    .values({
      email,
      role: input.role,
      tokenHash,
      expiresAt: sql`now() + ${VALIDITY}`,
      invitedBy: input.invitedBy,
    })
    .onConflictDoNothing({
      target: [invitations.tenantId, invitations.email],
      where: sql`status = 'pending'`,
    })
    .returning(columns);
  const row = rows[0];
  return row ? { ok: true, value: row, token } : { ok: false, reason: 'pending_exists' };
}

/** The college's invitations, newest first (at most 200), with the derived display status. */
export async function list(tx: Tx): Promise<InvitationView[]> {
  return tx
    .select({
      ...columns,
      displayStatus: sql<InvitationView['displayStatus']>`CASE
        WHEN ${invitations.status} = 'pending' AND ${invitations.expiresAt} <= now() THEN 'expired'
        ELSE ${invitations.status} END`,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt), desc(invitations.id))
    .limit(LIST_LIMIT);
}

/** True when the college has a pending, unexpired invitation for this email. */
export async function hasUsablePending(tx: Tx, email: string): Promise<boolean> {
  const rows = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.email, normaliseEmail(email)), isPending, isUnexpired))
    .limit(1);
  return rows.length > 0;
}

/**
 * True when an invitation of the current college for this email has not produced its account yet:
 * pending and unexpired, or claimed (`accepted`) within the last 10 minutes but not yet linked to an
 * account (accepted_user_id IS NULL — an acceptance in flight). Self-registration treats both alike
 * (server-actions.md §4.1 step 6), so it cannot race an acceptance. Older unlinked claims — a claim left
 * behind by a failed compensation or a killed process, or an accepted invitation whose account was later
 * deleted (FK ON DELETE SET NULL) — no longer count, so they never block registration for good. The window
 * is the same as users.deleteJustCreated's.
 */
export async function awaitsAccount(tx: Tx, email: string): Promise<boolean> {
  const rows = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, normaliseEmail(email)),
        or(
          and(isPending, isUnexpired),
          and(
            eq(invitations.status, 'accepted'),
            isNull(invitations.acceptedUserId),
            sql`${invitations.acceptedAt} > now() - ${CLAIM_IN_FLIGHT}`,
          ),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Revokes a pending invitation of this college (also an expired one, which is still pending).
 * `not_found` for an unknown id, another college's id, or a non-uuid; `not_pending` when already accepted or
 * revoked.
 */
export async function revoke(tx: Tx, id: string): Promise<InvitationRevokeResult> {
  if (!isUuid(id)) return 'not_found';
  const updated = await tx
    .update(invitations)
    .set({ status: 'revoked' })
    .where(and(eq(invitations.id, id), isPending))
    .returning({ id: invitations.id });
  if (updated.length > 0) return 'revoked';
  const existing = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.id, id))
    .limit(1);
  return existing.length > 0 ? 'not_pending' : 'not_found';
}

/**
 * The invitation with this token hash, whatever its status (the caller decides whether it is usable).
 * Meant for withInvitationToken, where the `invitation_token_lookup` policy exposes only the matching row;
 * inside withTenant it can only find the current college's invitations.
 */
export async function findByTokenHash(tx: Tx, tokenHash: string): Promise<Invitation | null> {
  const rows = await tx
    .select(columns)
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically moves a pending, unexpired invitation to `accepted` and returns it; null otherwise (unknown,
 * another college's, already claimed, revoked, or expired). A concurrent claim waits for the row lock and
 * then re-checks the status, so of two simultaneous claims exactly one succeeds.
 */
export async function claim(tx: Tx, id: string): Promise<Invitation | null> {
  if (!isUuid(id)) return null;
  const rows = await tx
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: sql`now()` })
    .where(and(eq(invitations.id, id), isPending, isUnexpired))
    .returning(columns);
  return rows[0] ?? null;
}

/**
 * Undoes a claim (server-actions.md §4.7 step 6 compensation): back to `pending`, accepted_at cleared, so the
 * invitation can be used again. Only a bare claim is undone — an invitation already linked to its account
 * (setAcceptedUser) is left as it is. Does nothing for an unknown or another college's id.
 */
export async function release(tx: Tx, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await tx
    .update(invitations)
    .set({ status: 'pending', acceptedAt: null })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.status, 'accepted'),
        isNull(invitations.acceptedUserId),
      ),
    );
}

/**
 * Links a claimed invitation to the account created for it. Throws when the invitation is not claimed or is
 * already linked to an account (an existing link is never overwritten).
 */
export async function setAcceptedUser(tx: Tx, id: string, userId: string): Promise<void> {
  const rows = isUuid(id)
    ? await tx
        .update(invitations)
        .set({ acceptedUserId: userId })
        .where(
          and(
            eq(invitations.id, id),
            eq(invitations.status, 'accepted'),
            isNull(invitations.acceptedUserId),
          ),
        )
        .returning({ id: invitations.id })
    : [];
  if (rows.length === 0)
    throw new Error('invitations.setAcceptedUser: invitation not claimed or already linked');
}
