import type { InvitationStatus, Role, UserSummary } from '../constants';
import { isThrowAwayDatabase } from './identifiers';
import { setTenantContext, withOwnerTransaction } from './owner';

/**
 * Test support (contracts/db-api.md §3): reads through the owner connection for packages/db/test and
 * apps/web/e2e only. Tenant-scoped reads set the tenant context first (forced RLS).
 */

export type UserDetails = UserSummary & { privacyConsentAt: Date | null };

/** The account with this email in any college (input trimmed and lower-cased), or null. */
export function getUserByEmail(migrationUrl: string, email: string): Promise<UserDetails | null> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query<UserDetails>(
      `SELECT id, tenant_id AS "tenantId", name, email, email_verified AS "emailVerified", role, status,
              locale, created_at AS "createdAt", privacy_consent_at AS "privacyConsentAt"
         FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Number of audit events with this action in the college with this slug (0 for an unknown slug); with
 * `targetId`, only the events about that target.
 */
export function countAuditEvents(
  migrationUrl: string,
  tenantSlug: string,
  action: string,
  targetId?: string,
): Promise<number> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const tenant = await client.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
      tenantSlug,
    ]);
    const tenantId = tenant.rows[0]?.id;
    if (tenantId === undefined) return 0;
    await setTenantContext(client, tenantId);
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
        WHERE tenant_id = $1 AND action = $2 AND ($3::text IS NULL OR target_id = $3)`,
      [tenantId, action, targetId ?? null],
    );
    return result.rows[0]?.count ?? 0;
  });
}

/** A stored invitation as e2e tests compare it before and after a refused action. */
export interface InvitationDetails {
  id: string;
  email: string;
  role: Role;
  /** Stored status (`pending`, `accepted`, `revoked`); "expired" is derived, never stored. */
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/**
 * Every invitation of the college with this slug, oldest first (created_at, id); empty for an unknown
 * slug. Read in the college's context and filtered explicitly (a superuser owner bypasses RLS).
 */
export function listInvitations(
  migrationUrl: string,
  tenantSlug: string,
): Promise<InvitationDetails[]> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const tenant = await client.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [
      tenantSlug,
    ]);
    const tenantId = tenant.rows[0]?.id;
    if (tenantId === undefined) return [];
    await setTenantContext(client, tenantId);
    const result = await client.query<InvitationDetails>(
      `SELECT id, email, role, status, expires_at AS "expiresAt", accepted_at AS "acceptedAt"
         FROM invitations WHERE tenant_id = $1 ORDER BY created_at, id`,
      [tenantId],
    );
    return result.rows;
  });
}

/** Number of sessions of the account with this email (input trimmed and lower-cased); 0 if unknown. */
export function countSessionsByEmail(migrationUrl: string, email: string): Promise<number> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE users.email = $1`,
      [email.trim().toLowerCase()],
    );
    return result.rows[0]?.count ?? 0;
  });
}

/** True for a throw-away test database (masari_test…, masari_e2e…) named in migrationUrl. */
function isThrowAwayUrl(migrationUrl: string): boolean {
  return isThrowAwayDatabase(decodeURIComponent(new URL(migrationUrl).pathname.slice(1)));
}

export interface StudentProfileFixture {
  studentCode: string;
  /** Default 1. */
  level?: number;
  /**
   * Code of a division of the account's college (active or not); default its first ACTIVE division (sort
   * order, code) — the one a student could pick on the screens.
   */
  divisionCode?: string;
}

/**
 * Gives the account with this email an academic profile directly in the database (e2e fixture: signed-in
 * specs that are not about onboarding skip the screens). No audit row is written. Throws for an unknown
 * email or division (also when no code is given and the college has no active division), and — before a
 * connection is opened — on any database but a throw-away test one.
 */
export async function createStudentProfile(
  migrationUrl: string,
  email: string,
  input: StudentProfileFixture,
): Promise<void> {
  if (!isThrowAwayUrl(migrationUrl)) {
    throw new Error('Refusing to create a student profile outside a test database');
  }
  await withOwnerTransaction(migrationUrl, async (client) => {
    const user = await client.query<{ id: string; tenantId: string }>(
      'SELECT id, tenant_id AS "tenantId" FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    const account = user.rows[0];
    if (account === undefined) throw new Error('createStudentProfile: unknown account');
    await setTenantContext(client, account.tenantId);
    // Filtered explicitly: the owner may be a superuser, which bypasses even forced row-level security.
    const division = await client.query<{ id: string }>(
      `SELECT id FROM divisions
        WHERE tenant_id = $1 AND (CASE WHEN $2::text IS NULL THEN is_active ELSE code = $2 END)
        ORDER BY sort_order, code LIMIT 1`,
      [account.tenantId, input.divisionCode ?? null],
    );
    const divisionId = division.rows[0]?.id;
    if (divisionId === undefined) throw new Error('createStudentProfile: unknown division');
    await client.query(
      `INSERT INTO student_profiles (user_id, student_code, level, division_id)
       VALUES ($1, $2, $3, $4)`,
      [account.id, input.studentCode, input.level ?? 1, divisionId],
    );
  });
}

/** The stored academic profile, with its division's code, as e2e tests compare it before and after. */
export interface StudentProfileDetails {
  studentCode: string;
  level: number;
  divisionCode: string;
}

/** The academic profile of the account with this email (input trimmed and lower-cased), or null. */
export function getStudentProfileByEmail(
  migrationUrl: string,
  email: string,
): Promise<StudentProfileDetails | null> {
  return withOwnerTransaction(migrationUrl, async (client) => {
    const user = await client.query<{ id: string; tenantId: string }>(
      'SELECT id, tenant_id AS "tenantId" FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    const account = user.rows[0];
    if (account === undefined) return null;
    await setTenantContext(client, account.tenantId);
    const result = await client.query<StudentProfileDetails>(
      `SELECT p.student_code AS "studentCode", p.level, d.code AS "divisionCode"
         FROM student_profiles p JOIN divisions d ON d.id = p.division_id
        WHERE p.tenant_id = $1 AND p.user_id = $2`,
      [account.tenantId, account.id],
    );
    return result.rows[0] ?? null;
  });
}

export interface DivisionFixture {
  code: string;
  nameAr: string;
  nameEn: string;
  /** Default 0. */
  sortOrder?: number;
  /** Default true. */
  isActive?: boolean;
}

/**
 * Adds a division to the college with this id (e2e fixture until the divisions screen exists, PR-36). No
 * audit row is written. Only on a throw-away test database (refused before a connection is opened).
 */
export async function addDivision(
  migrationUrl: string,
  tenantId: string,
  input: DivisionFixture,
): Promise<void> {
  if (!isThrowAwayUrl(migrationUrl)) {
    throw new Error('Refusing to add a division outside a test database');
  }
  await withOwnerTransaction(migrationUrl, async (client) => {
    await setTenantContext(client, tenantId);
    await client.query(
      `INSERT INTO divisions (code, name_ar, name_en, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.code, input.nameAr, input.nameEn, input.sortOrder ?? 0, input.isActive ?? true],
    );
  });
}

/**
 * Deletes the rate-limit counters whose key starts with `keyPrefix` (all of them by default) and returns
 * how many were removed. Only on a throw-away test database (masari_test…, masari_e2e…): any other
 * database name in migrationUrl is refused before a connection is opened.
 */
export async function resetRateLimits(migrationUrl: string, keyPrefix = ''): Promise<number> {
  if (!isThrowAwayUrl(migrationUrl)) {
    throw new Error('Refusing to reset rate limits outside a test database');
  }
  return withOwnerTransaction(migrationUrl, async (client) => {
    const result = await client.query(
      'DELETE FROM rate_limit_counters WHERE starts_with(key, $1)',
      [keyPrefix],
    );
    return result.rowCount ?? 0;
  });
}

/**
 * e2e fixture: moves the expiry of the pending invitations for this email (input trimmed and lower-cased),
 * in any college, one minute into the past. Throws when there is none; only on a throw-away test database
 * (refused before a connection is opened).
 */
export async function expireInvitation(migrationUrl: string, email: string): Promise<void> {
  if (!isThrowAwayUrl(migrationUrl)) {
    throw new Error('Refusing to expire an invitation outside a test database');
  }
  await withOwnerTransaction(migrationUrl, async (client) => {
    // Forced row-level security: each college's rows are updated in its own context (tenants is global).
    // Filtered explicitly as well: a superuser owner bypasses even forced row-level security.
    const colleges = await client.query<{ id: string }>('SELECT id FROM tenants ORDER BY id');
    let changed = 0;
    for (const college of colleges.rows) {
      await setTenantContext(client, college.id);
      const result = await client.query(
        `UPDATE invitations SET expires_at = now() - interval '1 minute'
          WHERE tenant_id = $1 AND email = $2 AND status = 'pending'`,
        [college.id, email.trim().toLowerCase()],
      );
      changed += result.rowCount ?? 0;
    }
    if (changed === 0) throw new Error('expireInvitation: no pending invitation for this email');
  });
}
