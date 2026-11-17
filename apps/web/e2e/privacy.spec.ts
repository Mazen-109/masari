import ar from '../messages/ar.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import { expect, test } from './support/fixtures';

// Privacy notice and the public shell (FR-011, contracts/routes.md §2).

const CATALOGS = { ar, en } as const;

for (const locale of ['ar', 'en'] as const) {
  const messages = CATALOGS[locale];

  test(`the privacy notice covers the four points of FR-011 (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/privacy`);

    await expect(page).toHaveTitle(
      messages.meta.titleTemplate.replace('%s', messages.meta.privacy),
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.privacy.title);
    const sections = page.locator('main').getByRole('heading', { level: 2 });
    await expect(sections).toHaveText([
      messages.privacy.collected.title,
      messages.privacy.purpose.title,
      messages.privacy.access.title,
      messages.privacy.rights.title,
    ]);
    await expect(page.locator('main')).toContainText(messages.privacy.rights.delete);
  });

  test(`the public shell has a header, main, and a footer link to the notice (${locale})`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/privacy`);

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('main#main')).toBeVisible();
    const footerLink = page
      .getByRole('contentinfo')
      .getByRole('link', { name: messages.common.privacyNotice });
    await expect(footerLink).toHaveAttribute('href', `/${locale}/privacy`);

    await page.keyboard.press('Tab');
    await expect(page.locator('a[href="#main"]')).toBeFocused();
  });
}

test('the language switch on the privacy notice keeps the page', async ({ page }) => {
  await page.goto('/ar/privacy');
  await page.getByRole('link', { name: ar.common.switchLanguage }).click();
  await expect(page).toHaveURL('/en/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.privacy.title);
});
