import {
  studentProfiles,
  tenants,
  users,
  withTenant,
  type Locale,
  type ModuleKey,
  type Role,
} from '@masari/db';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { safeNext } from '@/lib/safe-next';
import { getAuth } from '@/server/auth/auth';
import { can, type Permission } from '@/server/auth/permissions';

/**
 * Session context and page guards (contracts/permissions.md §3; FR-008, FR-014, FR-015, FR-019).
 * Guards are the only place that decide access; pages call requireSession / requirePermission themselves
 * (guard-coverage.test.ts), Server Actions call getActionContext (action-context.ts).
 */

export type SessionContext = {
  user: { id: string; name: string; email: string; role: Role; locale: Locale };
  tenant: {
    id: string;
    slug: string;
    nameAr: string;
    nameEn: string;
    levelsCount: number;
    enabledModules: ModuleKey[];
    allowedEmailDomains: string[];
  };
  /** The academic profile of a student; null for other roles and for a student who has none yet. */
  studentProfile: StudentProfileSummary | null;
};

export type StudentProfileSummary = { studentCode: string; level: number; divisionId: string };

/** Only roles that keep an academic profile (`profile.academic.manage_own`, i.e. students) have one. */
function keepsAcademicProfile(role: Role): boolean {
  return can(role, 'profile.academic.manage_own');
}

/** The student's profile read in the college's tenant context, without timestamps or ids it does not need. */
async function loadStudentProfile(
  tenantId: string,
  userId: string,
): Promise<StudentProfileSummary | null> {
  const profile = await withTenant({ tenantId, userId }, (tx) =>
    studentProfiles.findByUserId(tx, userId),
  );
  return profile === null
    ? null
    : { studentCode: profile.studentCode, level: profile.level, divisionId: profile.divisionId };
}

export type SessionDenialReason = 'none' | 'account_suspended' | 'tenant_suspended';

type Resolved =
  { context: SessionContext; denial: 'none' } | { context: null; denial: SessionDenialReason };

/**
 * One resolution per request (React cache). The session cookie is read only through the auth library
 * (no cookie cache); the user and the college are then read fresh from the database, so role changes and
 * suspensions apply on the next request (FR-019, FR-030, FR-031).
 */
const resolveSession = cache(async (): Promise<Resolved> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { context: null, denial: 'none' };

  const user = await users.findById(session.user.id);
  if (!user) return { context: null, denial: 'none' };
  if (user.status !== 'active') return { context: null, denial: 'account_suspended' };

  const tenant = await tenants.findById(user.tenantId);
  if (!tenant) return { context: null, denial: 'none' };
  if (tenant.status !== 'active') return { context: null, denial: 'tenant_suspended' };

  const studentProfile = keepsAcademicProfile(user.role)
    ? await loadStudentProfile(tenant.id, user.id)
    : null;

  return {
    denial: 'none',
    context: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locale: user.locale,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        nameAr: tenant.nameAr,
        nameEn: tenant.nameEn,
        levelsCount: tenant.levelsCount,
        enabledModules: tenant.enabledModules,
        allowedEmailDomains: tenant.allowedEmailDomains,
      },
      studentProfile,
    },
  };
});

/** null when there is no session, the user is suspended, or the college is suspended. */
export async function getSessionContext(): Promise<SessionContext | null> {
  return (await resolveSession()).context;
}

/** Why getSessionContext() returned null, for the sign-in banner. */
export async function getSessionDenialReason(): Promise<SessionDenialReason> {
  return (await resolveSession()).denial;
}

/** `/sign-in?next=…[&reason=…]` for the current locale. A returnTo that safeNext refuses is dropped. */
export function signInPath(locale: string, returnTo: string, reason: SessionDenialReason): string {
  const params = new URLSearchParams();
  const next = safeNext(returnTo);
  if (next !== null) params.set('next', next);
  if (reason !== 'none') params.set('reason', reason);
  const query = params.toString();
  return `/${locale}/sign-in${query === '' ? '' : `?${query}`}`;
}

/**
 * For pages. Redirects to the sign-in screen (with `next` and, when suspended, `reason`) without a usable
 * session. `returnTo` is the locale-less path (+ query) of the calling page. Redirects a student without an
 * academic profile to /onboarding (FR-024) unless `allowIncompleteProfile` is true.
 *
 * The context is cached per request (React cache), and a request can render a page after a Server Action
 * created the profile in that same request (the action's redirect). So "no profile" from the cache is never
 * trusted on its own: the profile is read again, uncached, before redirecting to /onboarding, and the
 * returned context carries the fresh profile.
 */
export async function requireSession(
  returnTo: string,
  opts?: { allowIncompleteProfile?: boolean },
): Promise<SessionContext> {
  const { context, denial } = await resolveSession();
  if (context === null) redirect(signInPath(await getLocale(), returnTo, denial));
  if (
    opts?.allowIncompleteProfile === true ||
    context.studentProfile !== null ||
    !keepsAcademicProfile(context.user.role)
  ) {
    return context;
  }
  const studentProfile = await loadStudentProfile(context.tenant.id, context.user.id);
  if (studentProfile === null) redirect(`/${await getLocale()}/onboarding`);
  return { ...context, studentProfile };
}

/** requireSession + notFound() when the role lacks the permission (FR-014, FR-015). */
export async function requirePermission(
  permission: Permission,
  returnTo: string,
): Promise<SessionContext> {
  const context = await requireSession(returnTo);
  if (!can(context.user.role, permission)) notFound();
  return context;
}
