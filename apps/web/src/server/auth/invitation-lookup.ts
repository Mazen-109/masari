import {
  hashInvitationToken,
  invitations,
  tenants,
  withInvitationToken,
  type Invitation,
  type Tenant,
} from '@masari/db';

/**
 * The invitation behind an invitation link (contracts/server-actions.md §4.7 step 3; FR-020, FR-021).
 * Shared by the `/invite/[token]` page, which shows the form only for a non-null result, and by
 * `acceptInvitationAction`. The plain token is only hashed here; it is never stored, compared, or logged.
 */

export type UsableInvitation = { invitation: Invitation; tenant: Tenant };

/** 32 random bytes in base64url without padding: anything else cannot be a link Masari issued. */
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Whether an invitation found by its token may still be accepted: pending, not expired, and its college
 * active. Expired, revoked, used, unknown, and suspended-college links are all equally "no longer valid".
 */
export function isUsableInvitation(
  invitation: Pick<Invitation, 'status' | 'expiresAt'> | null,
  tenant: Pick<Tenant, 'status'> | null,
  now: Date = new Date(),
): boolean {
  return (
    invitation !== null &&
    invitation.status === 'pending' &&
    invitation.expiresAt.getTime() > now.getTime() &&
    tenant?.status === 'active'
  );
}

/**
 * hash → `invitations.findByTokenHash` inside `withInvitationToken` (anonymous context; the RLS policy
 * `invitation_token_lookup` exposes only the matching row) → `tenants.findById` (global table) → usable?
 * A token that is not shaped like an issued one is answered without touching the database.
 */
export async function findUsableInvitation(token: string): Promise<UsableInvitation | null> {
  if (!INVITATION_TOKEN.test(token)) return null;
  const tokenHash = hashInvitationToken(token);
  const invitation = await withInvitationToken(tokenHash, (tx) =>
    invitations.findByTokenHash(tx, tokenHash),
  );
  if (invitation === null) return null;
  const tenant = await tenants.findById(invitation.tenantId);
  if (tenant === null || !isUsableInvitation(invitation, tenant)) return null;
  return { invitation, tenant };
}
