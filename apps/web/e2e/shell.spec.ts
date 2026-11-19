import type { Locator, Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { expect, test } from './support/fixtures';
import { CATALOGS, openUserMenu, signIn, userMenuTrigger, type TestLocale } from './support/flows';
import { registerStudentWithProfile } from './support/students';

// The signed-in shell (US1 acceptance scenario 3; contracts/routes.md §4–5 and §7, permissions.md §5;
// FR-016, FR-035, FR-039, FR-040, FR-042): navigation and module cards of a student, the 404 inside the
// shell, keyboard order, the user menu, and the drawer on phones.

const { ar } = CATALOGS;

/** A student's modules with every module enabled (contracts/permissions.md §5), in order. */
const STUDENT_MODULES = ['mueed', 'codejudge', 'kitabi', 'careermap', 'tadreeb'] as const;

/** Signs in a new student of the demo college and opens `/{locale}/dashboard`. */
async function signInStudent(page: Page, locale: TestLocale = 'ar'): Promise<void> {
  const email = await registerStudentWithProfile(page);
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

/**
 * Holds back — or fails, as if offline — the script chunk whose code contains `marker`: the code that the
 * user menu and the drawer fetch on first use (PR-40). Routing disables the HTTP cache, so the chunk is
 * requested again on this page. `requested` resolves when the page asks for it (its idle preload, which
 * also shows the page is hydrated); `release` lets a held chunk through.
 */
async function interceptChunk(
  page: Page,
  marker: string,
  mode: 'hold' | 'fail',
): Promise<{ requested: Promise<void>; release: () => void }> {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markRequested = () => {};
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route('**/_next/static/chunks/**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(marker)) return route.fulfill({ response, body });
    markRequested();
    if (mode === 'fail') return route.abort('internetdisconnected');
    await released;
    return route.fulfill({ response, body });
  });
  return { requested, release };
}

/** A string found only in the user menu's dropdown chunk (its sign-out form id). */
const DROPDOWN_CHUNK = 'user-menu-sign-out';
/** A string found only in the drawer's chunk (the sheet's `data-slot`). */
const DRAWER_CHUNK = 'sheet-content';

/** A fresh tab of the signed-in student's context with `/ar/dashboard` open and a chunk intercepted. */
async function dashboardWithChunk(
  page: Page,
  marker: string,
  mode: 'hold' | 'fail',
): Promise<{ tab: Page; requested: Promise<void>; release: () => void }> {
  const tab = await page.context().newPage();
  const chunk = await interceptChunk(tab, marker, mode);
  await tab.goto('/ar/dashboard');
  await chunk.requested;
  return { tab, ...chunk };
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
  // The focused item shows the focus ring (WCAG 2.4.7), not only a background change.
  await expect(page.getByRole('menuitem', { name: ar.nav.profile })).toHaveCSS(
    'outline-style',
    'solid',
  );

  await page.keyboard.press('ArrowDown');
  const signOutItem = page.getByRole('menuitem', { name: ar.auth.signOut.submit });
  await expect(signOutItem).toBeFocused();
  await expect(signOutItem).toHaveCSS('outline-style', 'solid');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await openUserMenu(page);
  await signOutItem.focus();
  // Hold the action's request until the busy state has been checked.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('/ar/dashboard', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await page.keyboard.press('Enter');
  const busyItem = page.locator('[data-slot="user-menu-sign-out"]');
  await expect(busyItem).toHaveAttribute('aria-busy', 'true');
  await expect(busyItem).toHaveAttribute('aria-disabled', 'true');
  await expect(busyItem).toHaveText(ar.common.actions.pending);
  release();
  await page.waitForURL('/ar/sign-in');
});

test('a failed sign-out request leaves the user menu usable again', async ({ page }) => {
  await signInStudent(page);
  // The sign-out action's request (a POST to the current page) fails as if the network were down.
  await page.route('/ar/dashboard', async (route) => {
    if (route.request().method() === 'POST') await route.abort('internetdisconnected');
    else await route.continue();
  });

  await openUserMenu(page);
  const signOutItem = page.locator('[data-slot="user-menu-sign-out"]');
  await signOutItem.click();

  await expect(signOutItem).toHaveText(ar.auth.signOut.submit);
  await expect(signOutItem).not.toHaveAttribute('aria-busy');
  await expect(signOutItem).not.toHaveAttribute('aria-disabled');
  await expect(page).toHaveURL('/ar/dashboard');

  // With the network back, the same item signs out.
  await page.unrouteAll();
  await signOutItem.click();
  await page.waitForURL('/ar/sign-in');
});

test('with JavaScript on, the no-JavaScript sign-out form takes no room in the header', async ({
  page,
}) => {
  await signInStudent(page);
  const fallback = page.getByRole('banner').locator('[data-slot="noscript-sign-out"]');
  await expect(fallback).toHaveCSS('display', 'none');
  await expect(fallback.locator('form')).toHaveCount(1);
});

test.describe('before the user menu code has arrived', () => {
  test('Enter opens it on the first item, and Escape returns focus to the trigger', async ({
    page,
  }) => {
    await signInStudent(page);
    const { tab, release } = await dashboardWithChunk(page, DROPDOWN_CHUNK, 'hold');
    const trigger = userMenuTrigger(tab);
    await trigger.focus();
    await tab.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-busy', 'true');
    await expect(tab.getByRole('menu')).toHaveCount(0);

    release();
    await expect(tab.getByRole('menu')).toBeVisible();
    await expect(tab.getByRole('menuitem', { name: ar.nav.profile })).toBeFocused();
    await expectNoA11yViolations(tab);
    await tab.keyboard.press('Escape');
    await expect(tab.getByRole('menu')).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).not.toHaveAttribute('aria-busy');
  });

  test('a pointer press opens it once the code arrives', async ({ page }) => {
    await signInStudent(page);
    const { tab, release } = await dashboardWithChunk(page, DROPDOWN_CHUNK, 'hold');
    await userMenuTrigger(tab).click();
    release();
    await expect(tab.getByRole('menu')).toBeVisible();
    await expect(tab.getByRole('menuitem', { name: ar.auth.signOut.submit })).toBeVisible();
  });

  test('keyboard focus on the trigger carries over, and a press given up meanwhile opens nothing', async ({
    page,
  }) => {
    await signInStudent(page);
    const focused = await dashboardWithChunk(page, DROPDOWN_CHUNK, 'hold');
    await userMenuTrigger(focused.tab).focus();
    focused.release();
    await expect(userMenuTrigger(focused.tab)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(focused.tab.locator('[data-slot="user-menu-trigger"][id]')).toHaveCount(1);
    await expect(userMenuTrigger(focused.tab)).toBeFocused();
    await expect(focused.tab.getByRole('menu')).toHaveCount(0);

    const movedOn = await dashboardWithChunk(page, DROPDOWN_CHUNK, 'hold');
    await userMenuTrigger(movedOn.tab).click();
    await movedOn.tab.getByRole('heading', { level: 1 }).click();
    movedOn.release();
    await expect(movedOn.tab.locator('[data-slot="user-menu-trigger"][id]')).toHaveCount(1);
    await expect(movedOn.tab.getByRole('menu')).toHaveCount(0);
  });

  test('a failed download leaves the page and the button usable, and a later press opens it', async ({
    page,
  }) => {
    await signInStudent(page);
    const { tab } = await dashboardWithChunk(page, DROPDOWN_CHUNK, 'fail');
    const trigger = userMenuTrigger(tab);
    await trigger.click();
    await expect(trigger).not.toHaveAttribute('aria-busy');
    await expect(tab.getByRole('menu')).toHaveCount(0);
    await expect(tab.getByRole('heading', { level: 1 })).toBeVisible();

    await tab.unrouteAll({ behavior: 'wait' });
    await expect(async () => {
      if (!(await tab.getByRole('menu').isVisible())) await trigger.click();
      await expect(tab.getByRole('menu')).toBeVisible({ timeout: 1_000 });
    }).toPass();
  });
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

  test('@mobile a press before the drawer code arrives opens it, and closing returns focus', async ({
    page,
  }) => {
    await signInStudent(page);
    const { tab, release } = await dashboardWithChunk(page, DRAWER_CHUNK, 'hold');
    const menuButton = tab.getByRole('button', { name: ar.nav.openMenu });
    const drawer = tab.getByRole('dialog', { name: ar.nav.menuTitle });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-busy', 'true');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toHaveCount(0);

    release();
    await expect(drawer).toBeVisible();
    // The open modal drawer hides the rest of the page from assistive technology (aria-hidden), so
    // the button is found by its slot, not its role, while the drawer is open.
    const hiddenButton = tab.locator('[data-slot="mobile-nav-trigger"]');
    await expect(hiddenButton).toHaveAttribute('aria-expanded', 'true');
    await expect(hiddenButton).not.toHaveAttribute('aria-busy');
    const controls = await hiddenButton.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(drawer).toHaveAttribute('id', controls ?? '');
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await tab.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).not.toHaveAttribute('aria-busy');
  });

  test('@mobile a failed drawer download leaves the screen usable, and a later press opens it', async ({
    page,
  }) => {
    await signInStudent(page);
    const { tab } = await dashboardWithChunk(page, DRAWER_CHUNK, 'fail');
    const menuButton = tab.getByRole('button', { name: ar.nav.openMenu });
    const drawer = tab.getByRole('dialog', { name: ar.nav.menuTitle });
    await menuButton.click();
    await expect(menuButton).not.toHaveAttribute('aria-busy');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toHaveCount(0);
    // The shell and the page are still there (no error screen).
    await expect(tab.getByRole('banner')).toBeVisible();
    await expect(tab.getByRole('heading', { level: 1 })).toBeVisible();

    await tab.unrouteAll({ behavior: 'wait' });
    await expect(async () => {
      if (!(await drawer.isVisible())) await menuButton.click();
      await expect(drawer).toBeVisible({ timeout: 1_000 });
    }).toPass();
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
