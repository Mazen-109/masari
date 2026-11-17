import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { expect, test } from './support/fixtures';
import { registerConfirmedStudent, signIn } from './support/flows';

// Accessibility scan of every screen in both languages (contracts/ci.md §5, FR-042). Every batch that adds
// a screen appends it here: public screens to PUBLIC_SCREENS; signed-in screens (scanned once per role
// that can open them, from PR-18 on when signing in exists) to SIGNED_IN_SCREENS.
export const PUBLIC_SCREENS: readonly string[] = [
  '/sign-in',
  '/sign-in?reason=account_suspended&reset=1&invited=1',
  '/privacy',
  '/register',
  '/verify-email',
  '/email-verified',
  '/email-verified?error=invalid_token',
];

export const SIGNED_IN_SCREENS: readonly { path: string; roles: readonly string[] }[] = [
  { path: '/dashboard', roles: ['student'] },
];

/**
 * Signs the page in as a new user of `role`. Only students can be created through the screens so far;
 * the staff roles come with invitations (PR-27), which extend this helper.
 */
async function signInAs(page: Page, role: string): Promise<void> {
  if (role !== 'student') throw new Error(`a11y: no sign-in fixture for the role ${role} yet`);
  const email = await registerConfirmedStudent(page);
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
