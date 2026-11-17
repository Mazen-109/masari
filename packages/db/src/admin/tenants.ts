import type pg from 'pg';
import type { TenantStatus } from '../constants';
import { generateInvitationToken } from '../tokens';
import { setTenantContext, withOwnerTransaction } from './owner';

/**
 * College creation for operator tools (contracts/db-api.md §3, data-model.md §5). A new college gets the
 * table defaults (4 levels, every module, no email-domain restriction) and the division `GEN`.
 */

export interface DivisionSeed {
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}

export interface NewTenantInput {
  slug: string;
  nameAr: string;
  nameEn: string;
}

export type CreateTenantResult =
  { ok: true; tenantId: string } | { ok: false; reason: 'slug_taken' };

export type CreateAdminInvitationResult =
  { ok: true; token: string } | { ok: false; reason: 'pending_exists' | 'email_has_account' };

export interface NewTenantWithAdminInput extends NewTenantInput {
  adminEmail: string;
}

export type CreateTenantWithAdminResult =
  | { ok: true; tenantId: string; token: string }
  | { ok: false; reason: 'slug_taken' | 'email_has_account' };

export const DEFAULT_DIVISION: DivisionSeed = {
  code: 'GEN',
  nameAr: 'عام',
  nameEn: 'General',
  sortOrder: 0,
};

/** Inserts the college; null when the slug is already used (nothing written). */
export async function insertTenant(
  client: pg.Client,
  input: NewTenantInput,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tenants (slug, name_ar, name_en) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [input.slug, input.nameAr, input.nameEn],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Inserts the divisions that do not exist yet into tenantId. Sets the tenant context first: tenant_id comes
 * from the column default app_tenant_id(), and forced RLS checks it against the same setting.
 */
export async function ensureDivisions(
  client: pg.Client,
  tenantId: string,
  rows: readonly DivisionSeed[],
): Promise<void> {
  await setTenantContext(client, tenantId);
  for (const row of rows) {
    await client.query(
      `INSERT INTO divisions (code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [row.code, row.nameAr, row.nameEn, row.sortOrder],
    );
  }
}

/**
 * Suspends or reactivates the college with this slug (contracts/db-api.md §3, cli.md §5). Changes the
 * status only: session rows stay, and the web app refuses them on every request while suspended.
 */
export function setTenantStatus(
  migrationUrl: string,
  slug: string,
  status: TenantStatus,
): Promise<'updated' | 'not_found'> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query(
      'UPDATE tenants SET status = $2, updated_at = now() WHERE slug = $1',
      [slug, status],
    );
    return (result.rowCount ?? 0) > 0 ? 'updated' : 'not_found';
  });
}

/** Creates a college with default settings and the GEN division in one transaction. */
export function createTenant(
  migrationUrl: string,
  input: NewTenantInput,
): Promise<CreateTenantResult> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const tenantId = await insertTenant(client, input);
    if (!tenantId) return { ok: false, reason: 'slug_taken' };
    await ensureDivisions(client, tenantId, [DEFAULT_DIVISION]);
    return { ok: true, tenantId };
  });
}

/**
 * Inserts a pending `admin` invitation (7 days, invited_by NULL = operator) into tenantId and records the
 * audit event `invitation.created {role}` with a NULL actor, on the caller's transaction. Same rules as
 * repositories/invitations.create (data-model.md §3.7): an account with this email in any college gives
 * `email_has_account` and writes nothing; an expired pending invitation for the email is revoked first; a
 * non-expired one gives `pending_exists`. Only the token hash is stored; the plain token is returned once.
 */
export async function insertAdminInvitation(
  client: pg.Client,
  tenantId: string,
  email: string,
): Promise<CreateAdminInvitationResult> {
  const normalised = email.trim().toLowerCase();
  const account = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [normalised]);
  if ((account.rowCount ?? 0) > 0) return { ok: false, reason: 'email_has_account' };

  await setTenantContext(client, tenantId);
  await client.query(
    `UPDATE invitations SET status = 'revoked'
      WHERE email = $1 AND status = 'pending' AND expires_at <= now()`,
    [normalised],
  );
  const { token, tokenHash } = generateInvitationToken();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO invitations (email, role, token_hash, expires_at)
     VALUES ($1, 'admin', $2, now() + interval '7 days')
     ON CONFLICT (tenant_id, email) WHERE status = 'pending' DO NOTHING
     RETURNING id`,
    [normalised, tokenHash],
  );
  const invitationId = inserted.rows[0]?.id;
  if (invitationId === undefined) return { ok: false, reason: 'pending_exists' };
  await client.query(
    `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, metadata)
     VALUES (NULL, 'invitation.created', 'invitation', $1, $2::jsonb)`,
    [invitationId, JSON.stringify({ role: 'admin' })],
  );
  return { ok: true, token };
}

/** Creates a pending administrator invitation for an existing college (contracts/db-api.md §3). */
export function createAdminInvitation(
  migrationUrl: string,
  tenantId: string,
  email: string,
): Promise<CreateAdminInvitationResult> {
  return withOwnerTransaction(migrationUrl, (client) =>
    insertAdminInvitation(client, tenantId, email),
  );
}

/** Carries a refusal out of the transaction so that it is rolled back. */
class RefusedCreation extends Error {
  constructor(readonly reason: 'email_has_account') {
    super('createTenantWithAdmin: refused');
  }
}

/**
 * The college, its GEN division, and its first administrator invitation in ONE transaction (`pnpm
 * tenant:create`, e2e operator helper): when any step fails or is refused, nothing is created.
 */
export async function createTenantWithAdmin(
  migrationUrl: string,
  input: NewTenantWithAdminInput,
): Promise<CreateTenantWithAdminResult> {
  try {
    return await withOwnerTransaction(
      migrationUrl,
      async (client): Promise<CreateTenantWithAdminResult> => {
        const tenantId = await insertTenant(client, input);
        if (!tenantId) return { ok: false, reason: 'slug_taken' };
        await ensureDivisions(client, tenantId, [DEFAULT_DIVISION]);
        const invitation = await insertAdminInvitation(client, tenantId, input.adminEmail);
        if (invitation.ok) return { ok: true, tenantId, token: invitation.token };
        if (invitation.reason === 'email_has_account') throw new RefusedCreation(invitation.reason);
        // A brand-new college has no invitations, so pending_exists cannot happen.
        throw new Error('createTenantWithAdmin: unexpected pending invitation in a new college');
      },
    );
  } catch (error) {
    if (error instanceof RefusedCreation) return { ok: false, reason: error.reason };
    throw error;
  }
}
