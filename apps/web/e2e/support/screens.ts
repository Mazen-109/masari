import type { Page } from '@playwright/test';
import { registerConfirmedStudent, signIn, signInAsDemoAdmin } from './flows';
import { registerStudentWithProfile } from './students';

// Every screen of the app, for the specs that visit them all: the accessibility scan (a11y.spec.ts,
// contracts/ci.md §5, FR-042) and the CSP check (security-headers.spec.ts, FR-048). Every batch that adds
// a screen appends it here: public screens to PUBLIC_SCREENS; signed-in screens (visited once per role
// that can open them) to SIGNED_IN_SCREENS. The pseudo-role `new_student` is a confirmed student who has
// not completed the academic profile yet (PR-22).

export const PUBLIC_SCREENS: readonly string[] = [
  '/sign-in',
  '/sign-in?reason=account_suspended&reset=1&invited=1',
  '/privacy',
  '/register',
  '/verify-email',
  '/email-verified',
  '/email-verified?error=invalid_token',
  '/forgot-password',
  '/reset-password',
  '/reset-password?error=INVALID_TOKEN',
  `/reset-password?token=${'Tk9'.repeat(8)}`,
  // An unknown invitation token: the "no longer valid" screen. The form is scanned by a11y.spec.ts.
  `/invite/${'Iv4_'.repeat(10)}a-Z`,
];

export const SIGNED_IN_SCREENS: readonly { path: string; roles: readonly string[] }[] = [
  { path: '/dashboard', roles: ['student', 'admin'] },
  { path: '/modules/mueed', roles: ['student'] },
  { path: '/onboarding', roles: ['new_student'] },
  { path: '/profile', roles: ['student'] },
  { path: '/admin/users', roles: ['admin'] },
  { path: '/admin/invitations', roles: ['admin'] },
  { path: '/admin/divisions', roles: ['admin'] },
  { path: '/admin/settings', roles: ['admin'] },
];

export const SCREEN_LOCALES = ['ar', 'en'] as const;

/** A screen path in a language: `/ar/sign-in`; `/` is the locale's home. */
export function localized(locale: string, path: string): string {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Signs the page in as a user of `role`: a new student, or the demo college's administrator (whose
 * college already has invitations to list). Faculty and Student Affairs follow with the role matrix (PR-30).
 */
export async function signInAs(page: Page, role: string): Promise<void> {
  if (role === 'admin') {
    await signInAsDemoAdmin(page);
    return;
  }
  if (role === 'new_student') {
    const email = await registerConfirmedStudent(page);
    await signIn(page, { email });
    await page.waitForURL('/ar/onboarding');
    return;
  }
  if (role !== 'student') throw new Error(`screens: no sign-in fixture for the role ${role} yet`);
  const email = await registerStudentWithProfile(page);
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
}
