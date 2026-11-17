import ar from '../messages/ar.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import { FALLBACK_NOT_FOUND_TITLE } from '../src/lib/fallback-text';
import { expect, test } from './support/fixtures';

// Locale routing (contracts/routes.md §1, §5; FR-036).

const notFoundTitle = (messages: typeof ar) =>
  messages.meta.titleTemplate.replace('%s', messages.meta.notFound);

test.describe('with an English browser language', () => {
  test.use({ locale: 'en-US' });

  test('/ redirects to /ar', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/ar');
  });
});

test('each locale sets lang and dir on <html>', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the language switch keeps the path and the query', async ({ page }) => {
  await page.goto('/ar?from=test');
  await page.getByRole('link', { name: ar.common.switchLanguage }).click();
  await expect(page).toHaveURL('/en?from=test');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('link', { name: en.common.switchLanguage }).click();
  await expect(page).toHaveURL('/ar?from=test');
});

test('the language switch on a 404 page keeps the path and the query', async ({ page }) => {
  await page.goto('/ar/nope?from=test');
  await page.getByRole('link', { name: ar.common.switchLanguage }).click();
  await expect(page).toHaveURL('/en/nope?from=test');
  await expect(page).toHaveTitle(notFoundTitle(en));
});

const NOT_FOUND_CASES = [
  { path: '/ar/nope', title: notFoundTitle(ar), lang: 'ar' },
  { path: '/en/nope', title: notFoundTitle(en), lang: 'en' },
  { path: '/fr', title: FALLBACK_NOT_FOUND_TITLE, lang: 'ar' },
  { path: '/en/x.png', title: notFoundTitle(en), lang: 'en' },
] as const;

for (const { path, title, lang } of NOT_FOUND_CASES) {
  test(`${path} answers 404 with the title "${title}"`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

for (const path of ['/ar', '/en']) {
  test(`no horizontal scroll at 320 px on ${path} @mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
