import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { CATALOGS, type TestLocale } from './support/flows';
import {
  localized,
  PUBLIC_SCREENS,
  SCREEN_LOCALES,
  SIGNED_IN_SCREENS,
  SIGNED_IN_TEST_TIMEOUT_MS,
  signInAs,
} from './support/screens';

// Small screens and zoom (FR-042, WCAG 2.1 SC 1.4.10 Reflow and 1.4.4 Resize text; contracts/ci.md §5):
// every screen of support/screens.ts, in both languages, (1) on a 320 px wide phone and (2) at 200% zoom of a
// 1280×800 window — a 640×400 CSS-pixel viewport at device scale factor 2. On every screen: the page never
// scrolls sideways (only a table may, inside its own focusable region — routes.md §7), the screen's heading
// is shown, every control of the header and of the main content lies fully inside the window, and the
// signed-in shell offers its navigation through the menu button. Signing in happens before the viewport is
// narrowed, so the fixtures run at the project's usual size.

const MODES = [
  {
    name: '320 px',
    viewport: { width: 320, height: 640 },
    options: {},
  },
  {
    name: '200% zoom',
    viewport: { width: 640, height: 400 },
    options: { deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
] as const;

/** Header and main controls that lie (partly) outside the window horizontally, described for the report. */
function clippedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const windowWidth = document.documentElement.clientWidth;
    const selector = [
      'header a',
      'header button',
      'main a',
      'main button',
      'main input',
      'main select',
      'main textarea',
      'main [tabindex="0"]',
    ].join(', ');
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        // A table scrolls inside its own region: its cells may lie outside the window.
        if (element.parentElement?.closest('[data-slot="table-container"]')) return false;
        if (getComputedStyle(element).visibility === 'hidden') return false;
        const box = element.getBoundingClientRect();
        // Not rendered (display: none, a closed drawer) or visually hidden (the 1 px sr-only pattern).
        if (box.width < 2 || box.height < 2) return false;
        return box.left < -1 || box.right > windowWidth + 1;
      })
      .map((element) => {
        const label = element.getAttribute('aria-label') ?? element.textContent ?? '';
        return `<${element.tagName.toLowerCase()}> "${label.trim().slice(0, 40)}"`;
      });
  });
}

async function expectUsable(
  page: Page,
  url: string,
  { locale, shell }: { locale: TestLocale; shell: boolean },
): Promise<void> {
  await page.goto(url);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(0);
  await expect(page.getByRole('heading', { level: 1 }), url).toBeVisible();
  expect(await clippedControls(page), `${url}: controls outside the window`).toEqual([]);
  if (shell) {
    await expect(
      page.getByRole('button', { name: CATALOGS[locale].nav.openMenu }),
      `${url}: the menu button`,
    ).toBeVisible();
  }
}

const SIGNED_IN_ROLES = [...new Set(SIGNED_IN_SCREENS.flatMap(({ roles }) => roles))];

for (const mode of MODES) {
  test.describe(mode.name, () => {
    test.use(mode.options);

    test(`@mobile every public screen is usable at ${mode.name}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(mode.viewport);
      for (const locale of SCREEN_LOCALES) {
        for (const path of PUBLIC_SCREENS) {
          await expectUsable(page, localized(locale, path), { locale, shell: false });
        }
      }
    });

    for (const role of SIGNED_IN_ROLES) {
      test(`@mobile every signed-in screen of ${role} is usable at ${mode.name}`, async ({
        page,
      }) => {
        test.setTimeout(SIGNED_IN_TEST_TIMEOUT_MS);
        await signInAs(page, role);
        await page.setViewportSize(mode.viewport);
        // The onboarding step has a minimal shell without navigation (routes.md §3).
        const shell = role !== 'new_student';
        for (const locale of SCREEN_LOCALES) {
          for (const { path } of SIGNED_IN_SCREENS.filter(({ roles }) => roles.includes(role))) {
            const url = localized(locale, path);
            await expectUsable(page, url, { locale, shell });
            await expect(page).toHaveURL(url);
          }
        }
      });
    }
  });
}
