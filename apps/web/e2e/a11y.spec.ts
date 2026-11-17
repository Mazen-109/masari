import { expectNoA11yViolations } from './support/axe';
import { expect, test } from './support/fixtures';

// Accessibility scan of every screen in both languages (contracts/ci.md §5, FR-042). Every batch that adds
// a screen appends it here: public screens to PUBLIC_SCREENS; signed-in screens (scanned once per role
// that can open them, from PR-18 on when signing in exists) to SIGNED_IN_SCREENS.
export const PUBLIC_SCREENS: readonly string[] = ['/', '/privacy'];

export const SIGNED_IN_SCREENS: readonly { path: string; roles: readonly string[] }[] = [];

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
