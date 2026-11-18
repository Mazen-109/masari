import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  completeProfile,
  registerConfirmedStudent,
  registerStudent,
  signIn,
  uniqueEmail,
} from './support/flows';
import { createCollege, uniqueCollegeSlug } from './support/operator';
import { registerStudentWithProfile } from './support/students';

// Accessibility scan of every screen in both languages (contracts/ci.md §5, FR-042). Every batch that adds
// a screen appends it here: public screens to PUBLIC_SCREENS; signed-in screens (scanned once per role
// that can open them, from PR-18 on when signing in exists) to SIGNED_IN_SCREENS. The pseudo-role
// `new_student` is a confirmed student who has not completed the academic profile yet (PR-22).
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
  // An unknown invitation token: the "no longer valid" screen. The form is scanned below.
  `/invite/${'Iv4_'.repeat(10)}a-Z`,
];

export const SIGNED_IN_SCREENS: readonly { path: string; roles: readonly string[] }[] = [
  { path: '/dashboard', roles: ['student'] },
  { path: '/modules/mueed', roles: ['student'] },
  { path: '/onboarding', roles: ['new_student'] },
  { path: '/profile', roles: ['student'] },
];

/**
 * Signs the page in as a new user of `role`. Only students can be created through the screens so far;
 * the staff roles come with invitations (PR-27), which extend this helper.
 */
async function signInAs(page: Page, role: string): Promise<void> {
  if (role === 'new_student') {
    const email = await registerConfirmedStudent(page);
    await signIn(page, { email });
    await page.waitForURL('/ar/onboarding');
    return;
  }
  if (role !== 'student') throw new Error(`a11y: no sign-in fixture for the role ${role} yet`);
  const email = await registerStudentWithProfile(page);
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
}

const LOCALES = ['ar', 'en'] as const;

function localized(locale: string, path: string): string {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

for (const locale of LOCALES) {
  for (const path of PUBLIC_SCREENS) {
    test(`no serious or critical violations on ${localized(locale, path)}`, async ({ page }) => {
      await page.goto(localized(locale, path));
      await expectNoA11yViolations(page);
    });
  }

  for (const { path, roles } of SIGNED_IN_SCREENS) {
    for (const role of roles) {
      test(`no serious or critical violations on ${localized(locale, path)} as ${role}`, async ({
        page,
      }) => {
        await signInAs(page, role);
        await page.goto(localized(locale, path));
        await expect(page).toHaveURL(localized(locale, path));
        await expectNoA11yViolations(page);
      });
    }
  }

  // Form states that only exist after an action answered.
  test(`no serious or critical violations on the sign-in error state (${locale})`, async ({
    page,
  }) => {
    await signIn(page, { email: uniqueEmail('nobody'), locale });
    await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
      'data-code',
      'invalid_credentials',
    );
    await expectNoA11yViolations(page);
  });

  test(`no serious or critical violations on sign-in with an unconfirmed email (${locale})`, async ({
    page,
  }) => {
    const email = uniqueEmail();
    await registerStudent(page, { email, locale });
    await page.waitForURL(`/${locale}/verify-email`);
    await signIn(page, { email, locale });
    await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
      'data-code',
      'email_not_verified',
    );
    await expect(
      page.getByRole('heading', { level: 2, name: CATALOGS[locale].auth.resend.titleMissing }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test(`no serious or critical violations on the forgot-password confirmation (${locale})`, async ({
    page,
  }) => {
    const t = CATALOGS[locale].auth.forgotPassword;
    await page.goto(localized(locale, '/forgot-password'));
    await page.getByLabel(t.email, { exact: true }).fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: t.submit }).click();
    await expect(page.locator('main [data-slot="form-status"]')).toHaveText(t.sent);
    await expectNoA11yViolations(page);
  });

  test(`no serious or critical violations on a refused reset link (${locale})`, async ({
    page,
  }) => {
    const t = CATALOGS[locale].auth.resetPassword;
    await page.goto(localized(locale, `/reset-password?token=${'Tk9'.repeat(8)}`));
    await page.getByLabel(t.password, { exact: true }).fill('Xy7'.repeat(4));
    await page.getByRole('button', { name: t.submit }).click();
    await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
      'data-code',
      'token_invalid',
    );
    await expectNoA11yViolations(page);
  });

  test(`no serious or critical violations on /${locale}/invite/<valid token> and its errors`, async ({
    page,
  }) => {
    const college = await createCollege(uniqueCollegeSlug('a11y'), uniqueEmail('dean'));
    await page.goto(localized(locale, college.invitePath));
    await expect(page.locator('main form')).toHaveCount(1);
    await expectNoA11yViolations(page);

    await acceptInvitation(page, {
      invitePath: college.invitePath,
      locale,
      password: 'short',
      consent: false,
      open: false,
    });
    await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
      'data-code',
      'validation',
    );
    await expectNoA11yViolations(page);
  });

  test(`no serious or critical violations on the onboarding form with field errors (${locale})`, async ({
    page,
  }) => {
    await signInAs(page, 'new_student');
    await page.goto(localized(locale, '/onboarding'));
    await completeProfile(page, { locale, studentCode: 'x y' });
    const code = page.getByLabel(CATALOGS[locale].onboarding.studentCode, { exact: true });
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
      'data-code',
      'validation',
    );
    await expectNoA11yViolations(page);
  });

  test(`first Tab focuses the skip link; Enter moves focus to main (${locale})`, async ({
    page,
  }) => {
    await page.goto(localized(locale, '/'));
    await page.keyboard.press('Tab');

    const skipLink = page.locator('a[href="#main"]');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    expect(await skipLink.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');

    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });
}

test('the scan fails on an injected contrast violation', async ({ page }) => {
  await page.goto('/ar');
  await page.locator('main').evaluate((main) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'low contrast';
    paragraph.style.color = '#999999';
    paragraph.style.backgroundColor = '#aaaaaa';
    main.append(paragraph);
  });

  await expect(expectNoA11yViolations(page)).rejects.toThrow(/color-contrast/);
});
