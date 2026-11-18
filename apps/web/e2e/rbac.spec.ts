import type { Locator, Page } from '@playwright/test';
import { countAuditEvents, countSessions, getUserByEmail, listInvitations } from './support/db';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  inviteForm,
  openUserMenu,
  signIn,
  uniqueEmail,
  type TestLocale,
} from './support/flows';
import { submitAs } from './support/forge';
import {
  openDialog,
  roleDialog,
  roleTrigger,
  suspendDialog,
  suspendTrigger,
  userRow,
} from './support/people';
import {
  APP_ROLES,
  ensureRoleCollege,
  roleStorageState,
  signInAs,
  type AppRole,
  type RoleCollege,
} from './support/roles';

// Role-based access (US5 acceptance scenarios 4–5; contracts/permissions.md §5, routes.md §4,
// server-actions.md §6; FR-014, FR-015, FR-016; SC-004). Data-driven: one expectation table mirrors
// permissions.md §5, and every test title names its role × capability case. All roles live in one college
// of their own (support/roles.ts), with every module enabled.

const MODULES = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'] as const;
const ADMIN_SCREENS = ['users', 'invitations', 'divisions', 'settings'] as const;

type ModuleKey = (typeof MODULES)[number];
type AdminScreen = (typeof ADMIN_SCREENS)[number];

/** contracts/permissions.md §5: module entries and admin entries per role, in navigation order. */
const ACCESS: Record<AppRole, { modules: readonly ModuleKey[]; admin: readonly AdminScreen[] }> = {
  student: { modules: ['mueed', 'codejudge', 'kitabi', 'careermap', 'tadreeb'], admin: [] },
  faculty: { modules: ['codejudge', 'mizan'], admin: [] },
  student_affairs: { modules: ['mueed'], admin: [] },
  admin: {
    modules: ['kitabi', 'tadreeb'],
    admin: ['users', 'invitations', 'divisions', 'settings'],
  },
};

/**
 * Admin screens that exist so far. Settings (PR-35) and Divisions (PR-36) add their key here; until then
 * their entries are not expected on screen and their paths are only checked as refused.
 */
const BUILT_ADMIN_SCREENS: readonly AdminScreen[] = ['users', 'invitations'];

type Catalog = (typeof CATALOGS)[TestLocale];

type AppPath = {
  /** Locale-less path of routes.md §4. */
  path: string;
  /** Who may open it. */
  permitted: (role: AppRole) => boolean;
  /** False for an admin screen whose batch has not landed yet. */
  built: boolean;
  /** The screen's level-1 heading (null: it varies, e.g. the greeting). */
  heading: (t: Catalog) => string | null;
  /** Headings and texts of the screen that a refused user must never see. */
  restricted: (t: Catalog) => readonly string[];
};

/** The level-1 heading of an admin screen first, then other texts only that screen shows. */
function adminScreenTexts(t: Catalog, screen: AdminScreen): readonly [string, ...string[]] {
  switch (screen) {
    case 'users':
      return [t.admin.users.title, t.admin.users.lead, t.admin.users.list.title];
    case 'invitations':
      return [
        t.admin.invitations.title,
        t.admin.invitations.form.title,
        t.admin.invitations.list.title,
      ];
    default:
      return [t.nav.admin[screen]];
  }
}

/** Every `(app)` path of contracts/routes.md §4. */
const APP_PATHS: readonly AppPath[] = [
  {
    path: '/dashboard',
    permitted: () => true,
    built: true,
    heading: () => null,
    restricted: () => [],
  },
  {
    path: '/profile',
    permitted: () => true,
    built: true,
    heading: (t) => t.profile.title,
    restricted: () => [],
  },
  ...MODULES.map((key): AppPath => ({
    path: `/modules/${key}`,
    permitted: (role) => ACCESS[role].modules.includes(key),
    built: true,
    heading: (t) => t.modules[key].name,
    restricted: (t) => [t.modules[key].name, t.modules[key].description],
  })),
  ...ADMIN_SCREENS.map((screen): AppPath => ({
    path: `/admin/${screen}`,
    permitted: (role) => ACCESS[role].admin.includes(screen),
    built: BUILT_ADMIN_SCREENS.includes(screen),
    heading: (t) => adminScreenTexts(t, screen)[0],
    restricted: (t) => adminScreenTexts(t, screen),
  })),
];

// The first test builds the role college through the screens (about a dozen form submissions); the others
// wait for it.
test.describe.configure({ timeout: 180_000 });

function mainNav(page: Page, locale: TestLocale): Locator {
  return page.getByRole('navigation', { name: CATALOGS[locale].nav.label });
}

/** Values of `attribute` of the elements matched, in document order. */
function attributeValues(locator: Locator, attribute: string): Promise<(string | null)[]> {
  return locator.evaluateAll(
    (elements, name) => elements.map((element) => element.getAttribute(name)),
    attribute,
  );
}

async function expectNavigationAndCards(page: Page, role: AppRole, locale: TestLocale) {
  const t = CATALOGS[locale];
  const { modules } = ACCESS[role];
  const admin = ACCESS[role].admin.filter((screen) => BUILT_ADMIN_SCREENS.includes(screen));
  await signInAs(page, role);
  if (locale !== 'ar') await page.goto(`/${locale}/dashboard`);

  await expect(mainNav(page, locale).getByRole('link')).toHaveText([
    t.nav.home,
    ...modules.map((key) => t.modules[key].name),
    ...admin.map((screen) => t.nav.admin[screen]),
  ]);
  await expect(mainNav(page, locale).getByText(t.nav.adminSection, { exact: true })).toHaveCount(
    admin.length === 0 ? 0 : 1,
  );
  expect(await attributeValues(page.locator('main [data-module]'), 'data-module')).toEqual(modules);
  expect(await attributeValues(page.locator('main [data-shortcut]'), 'data-shortcut')).toEqual(
    admin,
  );
}

async function expectNotFound(page: Page, role: AppRole, entry: AppPath, locale: TestLocale) {
  const t = CATALOGS[locale];
  await signInAs(page, role);
  const response = await page.goto(`/${locale}${entry.path}`);
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(`/${locale}${entry.path}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.common.notFound.title);
  // The tab title is the 404 title too: it must not name the screen that was refused.
  const title = await page.title();
  expect(title).toContain(t.meta.notFound);
  for (const text of entry.restricted(t)) {
    await expect(page.getByRole('heading', { name: text, exact: true })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(text);
    expect(title).not.toContain(text);
  }
  await expect(page.locator('main form')).toHaveCount(0);
}

async function expectOpens(page: Page, role: AppRole, entry: AppPath, locale: TestLocale) {
  const t = CATALOGS[locale];
  await signInAs(page, role);
  const response = await page.goto(`/${locale}${entry.path}`);
  expect(response?.status()).toBe(200);
  // Not sent elsewhere — in particular staff never to /onboarding.
  await expect(page).toHaveURL(`/${locale}${entry.path}`);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).not.toHaveText(t.common.notFound.title);
  const expected = entry.heading(t);
  if (expected !== null) await expect(heading).toHaveText(expected);
}

/** Role × capability cases in `locale`: navigation and cards, then every path (opens or 404). */
function describeRole(role: AppRole, locale: TestLocale): void {
  test(`${role} (${locale}) · navigation and dashboard cards match the permission table`, async ({
    page,
  }) => {
    await expectNavigationAndCards(page, role, locale);
  });
  for (const entry of APP_PATHS) {
    if (!entry.permitted(role)) {
      test(`${role} (${locale}) · ${entry.path} is not found`, async ({ page }) => {
        await expectNotFound(page, role, entry, locale);
      });
    } else if (entry.built) {
      test(`${role} (${locale}) · ${entry.path} opens`, async ({ page }) => {
        await expectOpens(page, role, entry, locale);
      });
    }
  }
}

for (const role of APP_ROLES) describeRole(role, 'ar');
// Both languages for one role.
describeRole('faculty', 'en');

for (const role of ['faculty', 'student_affairs', 'admin'] as const) {
  test(`${role} · signing in lands on the dashboard, never on onboarding`, async ({ page }) => {
    const college = await ensureRoleCollege(page);
    await page.context().clearCookies();
    await signIn(page, { email: college.emails[role] });
    await expect(page).toHaveURL('/ar/dashboard');
    await page.goto('/ar/profile');
    await expect(page).toHaveURL('/ar/profile');
  });
}

// Forbidden actions (contracts/server-actions.md §6, "Another role's action"). Each row renders the real
// form as the administrator, then submits it with another role's session. PR-33…PR-36 append their actions.

type ForbiddenAction = {
  /** Locale-less path of the screen showing the form to the administrator. */
  screen: string;
  form: string;
  action: string;
  /** Fills the form on screen (as the administrator); returns it and how to submit it. */
  prepare: (
    page: Page,
    college: RoleCollege,
  ) => Promise<{ form: Locator; submit: () => Promise<void> }>;
  /** Everything the action could change; equal before and after the refused submission. */
  state: (college: RoleCollege) => Promise<unknown>;
};

/** Clicks `button` and waits for the action's answer (the POST to the screen). */
async function clickAndWait(page: Page, screenPath: string, button: Locator): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === screenPath,
    ),
    button.click(),
  ]);
}

async function invitationState(college: RoleCollege) {
  return {
    invitations: await listInvitations(college.slug),
    created: await countAuditEvents(college.slug, 'invitation.created'),
    revoked: await countAuditEvents(college.slug, 'invitation.revoked'),
  };
}

const { ar } = CATALOGS;

const FORBIDDEN_ACTIONS: readonly ForbiddenAction[] = [
  {
    screen: '/admin/invitations',
    form: 'invite',
    action: 'createInvitationAction',
    prepare: async (page) => {
      const form = inviteForm(page);
      await form
        .getByLabel(ar.admin.invitations.form.email, { exact: true })
        .fill(uniqueEmail('forbidden'));
      await form
        .getByLabel(ar.admin.invitations.form.role, { exact: true })
        .selectOption({ label: ar.common.roles.faculty });
      const button = form.getByRole('button', { name: ar.admin.invitations.form.submit });
      return { form, submit: () => clickAndWait(page, '/ar/admin/invitations', button) };
    },
    state: invitationState,
  },
  {
    screen: '/admin/invitations',
    form: 'revoke',
    action: 'revokeInvitationAction',
    prepare: (page, college) => {
      const row = page.locator('main [data-slot="invitations-table"] tbody tr', {
        hasText: college.pendingInvitationEmail,
      });
      const form = row.locator('form');
      const button = row.getByRole('button', { name: ar.admin.invitations.list.revoke });
      return Promise.resolve({
        form,
        submit: () => clickAndWait(page, '/ar/admin/invitations', button),
      });
    },
    state: invitationState,
  },
  {
    screen: '/admin/users',
    form: 'role',
    action: 'changeUserRoleAction',
    prepare: async (page, college) => {
      const row = userRow(page, college.emails.faculty);
      const form = await openDialog(roleTrigger(row), roleDialog(page));
      await form
        .getByLabel(ar.admin.users.actions.role.label, { exact: true })
        .selectOption('student_affairs');
      const button = form.getByRole('button', { name: ar.admin.users.actions.role.submit });
      return { form, submit: () => clickAndWait(page, '/ar/admin/users', button) };
    },
    state: async (college) => ({
      role: (await getUserByEmail(college.emails.faculty))?.role,
      changed: await countAuditEvents(college.slug, 'user.role_changed'),
    }),
  },
  {
    screen: '/admin/users',
    form: 'suspend',
    action: 'setUserStatusAction',
    prepare: async (page, college) => {
      const row = userRow(page, college.emails.faculty);
      const form = await openDialog(suspendTrigger(row), suspendDialog(page));
      const button = form.getByRole('button', { name: ar.admin.users.actions.suspend.submit });
      return { form, submit: () => clickAndWait(page, '/ar/admin/users', button) };
    },
    state: async (college) => ({
      status: (await getUserByEmail(college.emails.faculty))?.status,
      sessions: await countSessions(college.emails.faculty),
      suspended: await countAuditEvents(college.slug, 'user.suspended'),
    }),
  },
];

/** Proves the page is hydrated (the user menu opens), so a form submits as a Server Action call. */
async function waitForHydration(page: Page): Promise<void> {
  await openUserMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
}

for (const row of FORBIDDEN_ACTIONS) {
  for (const role of ['student', 'faculty', 'student_affairs'] as const) {
    test(`${role} · ${row.action} (${row.form} form of ${row.screen}) is forbidden and changes nothing`, async ({
      page,
    }) => {
      const asRole = await roleStorageState(page, role);
      const college = await signInAs(page, 'admin');
      await page.goto(`/ar${row.screen}`);
      await waitForHydration(page);
      const { form, submit } = await row.prepare(page, college);
      await expect(form).toHaveCount(1);
      const before = await row.state(college);

      await submitAs(page, asRole, submit);

      const error = form.locator('[data-slot="form-error"]');
      await expect(error).toHaveAttribute('data-code', 'forbidden');
      await expect(error).toContainText(ar.errors.forbidden);
      await expect(page).toHaveURL(`/ar${row.screen}`);
      expect(await row.state(college)).toEqual(before);
    });
  }
}
