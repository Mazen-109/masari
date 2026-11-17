import type { Locator, Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  openUserMenu,
  registerConfirmedStudent,
  signIn,
  userMenuTrigger,
  type TestLocale,
} from './support/flows';

// The signed-in shell (US1 acceptance scenario 3; contracts/routes.md §4–5 and §7, permissions.md §5;
// FR-016, FR-035, FR-039, FR-040, FR-042): navigation and module cards of a student, the 404 inside the
// shell, keyboard order, the user menu, and the drawer on phones.

const { ar } = CATALOGS;

/** A student's modules with every module enabled (contracts/permissions.md §5), in order. */
const STUDENT_MODULES = ['mueed', 'codejudge', 'kitabi', 'careermap', 'tadreeb'] as const;

/** Signs in a new student of the demo college and opens `/{locale}/dashboard`. */
async function signInStudent(page: Page, locale: TestLocale = 'ar'): Promise<void> {
  const email = await registerConfirmedStudent(page);
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
  if (locale !== 'ar') await page.goto(`/${locale}/dashboard`);
}

function mainNav(page: Page, locale: TestLocale = 'ar'): Locator {
  return page.getByRole('navigation', { name: CATALOGS[locale].nav.label });
}

/** A short description of the focused element: its `data-nav`/`data-slot`, else its text. */
async function focusedDescriptor(page: Page): Promise<{ id: string; x: number; y: number }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null) return { id: 'none', x: 0, y: 0 };
    const box = element.getBoundingClientRect();
    const id =
      element.dataset.nav ??
      element.dataset.slot ??
      (element.getAttribute('href') === '#main' ? 'skip-link' : null) ??
      element.getAttribute('href') ??
      element.tagName;
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
}

test('a student sees exactly Home and their five modules in the navigation and as cards', async ({
  page,
}) => {
  await signInStudent(page);

  const links = mainNav(page).getByRole('link');
  await expect(links).toHaveText([
    ar.nav.home,
    ...STUDENT_MODULES.map((key) => ar.modules[key].name),
  ]);
  await expect(mainNav(page).getByRole('link', { name: ar.nav.home })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(mainNav(page).getByText(ar.nav.adminSection)).toHaveCount(0);

  const cards = page.locator('main [data-module]');
  await expect(cards).toHaveCount(STUDENT_MODULES.length);
  for (const [index, key] of STUDENT_MODULES.entries()) {
    const card = cards.nth(index);
    await expect(card).toHaveAttribute('data-module', key);
    await expect(card.getByRole('heading', { level: 2 })).toHaveText(ar.modules[key].name);
    await expect(card).toContainText(ar.modules[key].description);
    await expect(card).toContainText(ar.dashboard.comingSoon);
  }

  await cards.first().getByRole('link').click();
  await expect(page).toHaveURL('/ar/modules/mueed');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.modules.mueed.name);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.modules.mueed.name));
  await expect(page.locator('main')).toContainText(ar.dashboard.comingSoon);
  await expect(mainNav(page).getByRole('link', { name: ar.modules.mueed.name })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(mainNav(page).locator('[aria-current="page"]')).toHaveCount(1);
});

for (const path of ['/ar/modules/mizan', '/ar/modules/unknown']) {
  test(`${path} answers the 404 page inside the shell`, async ({ page }) => {
    await signInStudent(page);

    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.common.notFound.title);
    await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.notFound));
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(userMenuTrigger(page)).toBeVisible();
    await expect(mainNav(page)).toBeVisible();
    await expect(mainNav(page).getByRole('link', { name: ar.modules.mizan.name })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(ar.modules.mizan.description);
    await expectNoA11yViolations(page);
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`keyboard: skip link first, then the header and the navigation in visual order (${locale})`, async ({
    page,
  }) => {
    await signInStudent(page, locale);
    // A fresh document, so focus starts at the top.
    await page.goto(`/${locale}/dashboard`);

    const stops: { id: string; x: number; y: number }[] = [];
    for (let index = 0; index < 4 + 1 + STUDENT_MODULES.length; index += 1) {
      await page.keyboard.press('Tab');
      stops.push(await focusedDescriptor(page));
    }

    expect(stops.map((stop) => stop.id)).toEqual([
      'skip-link',
      // The wordmark links home.
      `/${locale}/dashboard`,
      // The language switch links to the same path in the other language.
      `/${locale === 'ar' ? 'en' : 'ar'}/dashboard`,
      'user-menu-trigger',
      'home',
      ...STUDENT_MODULES.map((key) => `module-${key}`),
    ]);

    // Header: wordmark → language switch → user menu run along the reading direction.
    const header = stops.slice(1, 4).map((stop) => stop.x);
    const sorted = [...header].sort((a, b) => (locale === 'ar' ? b - a : a - b));
    expect(header).toEqual(sorted);
    // Navigation: top to bottom.
    const nav = stops.slice(4).map((stop) => stop.y);
    expect(nav).toEqual([...nav].sort((a, b) => a - b));
  });
}

test('the user menu works with the keyboard and passes axe while open', async ({ page }) => {
  await signInStudent(page);
  const trigger = userMenuTrigger(page);
  await expect(trigger).toContainText('Test Student');

  // Open with Enter (retried: a key press before hydration does nothing).
  const menu = page.getByRole('menu');
  await expect(async () => {
    if (!(await menu.isVisible())) {
      await trigger.focus();
      await page.keyboard.press('Enter');
    }
    await expect(menu).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(menu).toContainText(ar.common.roles.student);
  await expect(page.getByRole('menuitem', { name: ar.nav.profile })).toBeFocused();
  await expectNoA11yViolations(page);

  // Tab and Shift+Tab cannot leave the open menu.
  for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => element.contains(document.activeElement)), key).toBe(
      true,
    );
  }
  await expect(page.getByRole('menuitem', { name: ar.nav.profile })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: ar.auth.signOut.submit })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await openUserMenu(page);
  await page.getByRole('menuitem', { name: ar.auth.signOut.submit }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('/ar/sign-in');
});

test.describe('on a phone', () => {
  test('@mobile the drawer opens, traps focus, closes with Escape, and passes axe', async ({
    page,
  }) => {
    await signInStudent(page);
    await expect(mainNav(page)).toBeHidden();

    const menuButton = page.getByRole('button', { name: ar.nav.openMenu });
    const drawer = page.getByRole('dialog', { name: ar.nav.menuTitle });
    await expect(async () => {
      if (!(await drawer.isVisible())) await menuButton.click();
      await expect(drawer).toBeVisible({ timeout: 1_000 });
    }).toPass();

    const drawerNav = drawer.getByRole('navigation', { name: ar.nav.label });
    await expect(drawerNav.getByRole('link')).toHaveText([
      ar.nav.home,
      ...STUDENT_MODULES.map((key) => ar.modules[key].name),
    ]);
    await expectNoA11yViolations(page);

    // Focus stays inside the drawer however far Tab goes.
    for (let index = 0; index < STUDENT_MODULES.length + 3; index += 1) {
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    // Choosing an entry navigates and closes the drawer.
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await drawerNav.getByRole('link', { name: ar.modules.kitabi.name }).click();
    await expect(page).toHaveURL('/ar/modules/kitabi');
    await expect(drawer).toBeHidden();

    // Widening to the sidebar layout closes an open drawer: one "Main navigation" landmark only.
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('navigation', { name: ar.nav.label })).toHaveCount(1);
    await expect(mainNav(page)).toBeVisible();
  });

  test('@mobile no screen of the shell scrolls horizontally at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signInStudent(page);
    for (const path of ['/ar/dashboard', '/en/dashboard', '/ar/modules/mueed', '/ar/modules/x']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
