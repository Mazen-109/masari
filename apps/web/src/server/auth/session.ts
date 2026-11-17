import { tenants, users, type Locale, type ModuleKey, type Role } from '@masari/db';
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
  // `studentProfile` is added with the student_profiles table (PR-22).
};

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
 * session. `returnTo` is the locale-less path (+ query) of the calling page.
 *
 * `allowIncompleteProfile` is accepted now so pages are written against the final signature; the redirect
 * of students without an academic profile to /onboarding is added with the profile (PR-22).
 */
export async function requireSession(
  returnTo: string,
  opts?: { allowIncompleteProfile?: boolean },
): Promise<SessionContext> {
  void opts;
  const { context, denial } = await resolveSession();
  if (context === null) redirect(signInPath(await getLocale(), returnTo, denial));
  return context;
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
