import type { Page } from '@playwright/test';
import { registerConfirmedStudent, signIn, signInAsDemoAdmin } from './flows';
import { signInAs as signInAsRole } from './roles';
import { registerStudentWithProfile } from './students';

// Every screen of the app (contracts/routes.md §2–5), for the specs that visit them all: the accessibility
// scan (a11y.spec.ts, contracts/ci.md §5, FR-042), the CSP check (security-headers.spec.ts, FR-048), and
// the small-screen and zoom checks (responsive.spec.ts, FR-042). Every batch that adds a screen appends it
// here: public screens to PUBLIC_SCREENS; signed-in screens (visited once per role that can open them) to
// SIGNED_IN_SCREENS. The pseudo-role `new_student` is a confirmed student who has not completed the
// academic profile yet (PR-22).

export const PUBLIC_SCREENS: readonly string[] = [
  '/sign-in',
  '/sign-in?reason=account_suspended&reset=1&invited=1',
  '/privacy',
  '/register',
  // The college preselected and locked by the link (`u=<slug>`).
  '/register?u=demo',
  '/verify-email',
  '/email-verified',
  '/email-verified?error=invalid_token',
  '/forgot-password',
  '/reset-password',
  '/reset-password?error=INVALID_TOKEN',
  `/reset-password?token=${'Tk9'.repeat(8)}`,
  // An unknown invitation token: the "no longer valid" screen. The form is scanned by a11y.spec.ts.
  `/invite/${'Iv4_'.repeat(10)}a-Z`,
  // An unknown path under a valid locale: the localized 404 screen (routes.md §5).
  '/no-such-screen',
];

/** Every role of contracts/permissions.md §1. */
const ALL_ROLES = ['student', 'faculty', 'student_affairs', 'admin'] as const;

// Module screens per role: contracts/permissions.md §5 (the same table as rbac.spec.ts). Every module is
// enabled in the colleges the fixtures use.
export const SIGNED_IN_SCREENS: readonly { path: string; roles: readonly string[] }[] = [
  { path: '/dashboard', roles: ALL_ROLES },
  { path: '/profile', roles: ALL_ROLES },
  { path: '/modules/mueed', roles: ['student', 'student_affairs'] },
  { path: '/modules/codejudge', roles: ['student', 'faculty'] },
  { path: '/modules/mizan', roles: ['faculty'] },
  { path: '/modules/kitabi', roles: ['student', 'admin'] },
  { path: '/modules/careermap', roles: ['student'] },
  { path: '/modules/tadreeb', roles: ['student', 'admin'] },
  // A screen the role may not use: the localized 404 inside the signed-in shell (routes.md §5).
  { path: '/modules/mizan', roles: ['student'] },
  { path: '/onboarding', roles: ['new_student'] },
  { path: '/admin/users', roles: ['admin'] },
  // The People screen with every filter set and no matching row.
  { path: '/admin/users?q=nobody-matches&role=faculty&status=suspended', roles: ['admin'] },
  { path: '/admin/invitations', roles: ['admin'] },
  { path: '/admin/divisions', roles: ['admin'] },
  { path: '/admin/settings', roles: ['admin'] },
];

export const SCREEN_LOCALES = ['ar', 'en'] as const;

/**
 * Time limit of a test that signs in with signInAs: the first faculty or Student Affairs sign-in of a run
 * builds the role college through the screens (support/roles.ts), like the role-based access specs.
 */
export const SIGNED_IN_TEST_TIMEOUT_MS = 180_000;

/** A screen path in a language: `/ar/sign-in`; `/` is the locale's home. */
export function localized(locale: string, path: string): string {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Signs the page in as a user of `role`: a new student (with or without an academic profile), the demo
 * college's administrator (whose college already has invitations to list), or the faculty member or
 * Student Affairs member of the role-based access college (support/roles.ts). Never signs anyone out.
 */
export async function signInAs(page: Page, role: string): Promise<void> {
  if (role === 'admin') {
    await signInAsDemoAdmin(page);
    return;
  }
  if (role === 'faculty' || role === 'student_affairs') {
    await signInAsRole(page, role);
    return;
  }
  if (role === 'new_student') {
    const email = await registerConfirmedStudent(page);
    await signIn(page, { email });
    await page.waitForURL('/ar/onboarding');
    return;
  }
  if (role !== 'student') throw new Error(`screens: no sign-in fixture for the role ${role}`);
  const email = await registerStudentWithProfile(page);
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
}
