import { randomBytes, randomUUID } from 'node:crypto';
import type { Browser, Locator, Page } from '@playwright/test';
import {
  countAuditEvents,
  createStudentProfile,
  getUserByEmail,
  listAuditEvents,
} from './support/db';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  registerOnboardedStudent,
  registerStudent,
  signIn,
  uniqueEmail,
  uniqueStudentCode,
} from './support/flows';
import {
  createCollege,
  getCollegeSettings,
  uniqueCollegeSlug,
  type OnboardedCollege,
} from './support/operator';
import { clickAndWait } from './support/people';

// The college settings screen (US7 acceptance scenarios 1, 2, 3, 6 and US1 acceptance scenario 8;
// contracts/server-actions.md §5.4; FR-032, FR-034, FR-044). Every test works in a college of its own
// (contracts/ci.md §3), so its audit counts are exact; another college's settings never change.

const { ar } = CATALOGS;
const t = ar.admin.settings;
const SETTINGS_PATH = '/ar/admin/settings';
const ALL_MODULES = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'] as const;

type ModuleKey = (typeof ALL_MODULES)[number];

// Two tests register and onboard a student through the screens before the administrator signs in.
test.describe.configure({ timeout: 120_000 });

type ContextOptions = {
  baseURL: string | undefined;
  extraHTTPHeaders: Record<string, string> | undefined;
};

/** A second browser (another person's), with the test's client address. */
async function otherBrowser(browser: Browser, options: ContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

/** A new college with a pending administrator invitation for a new address. */
async function newCollege(): Promise<OnboardedCollege & { adminEmail: string }> {
  const adminEmail = uniqueEmail('settings-admin');
  return { ...(await createCollege(uniqueCollegeSlug('set'), adminEmail)), adminEmail };
}

/** The college's first administrator accepts the operator's invitation and signs in (ends on /ar/dashboard). */
async function signInAdmin(page: Page, college: OnboardedCollege & { adminEmail: string }) {
  await acceptInvitation(page, { invitePath: college.invitePath });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signIn(page, { email: college.adminEmail, open: false });
  await page.waitForURL('/ar/dashboard');
}

function settingsForm(page: Page): Locator {
  return page.locator('main form');
}

function control(page: Page, label: string): Locator {
  return settingsForm(page).getByLabel(label, { exact: true });
}

function moduleBox(page: Page, key: ModuleKey): Locator {
  return settingsForm(page)
    .getByRole('group', { name: t.modules.legend })
    .getByRole('checkbox', { name: ar.modules[key].name, exact: true });
}

/** Submits the settings form and waits for the action's answer. */
async function save(page: Page): Promise<void> {
  await clickAndWait(page, SETTINGS_PATH, page.getByRole('button', { name: t.submit }));
}

async function saveAndExpectSaved(page: Page): Promise<void> {
  await save(page);
  await expect(page.locator('main [data-slot="settings-saved"]')).toHaveText(t.saved);
  await expect(page.locator('main [data-slot="form-error"]')).toHaveCount(0);
}

function collegeName(page: Page): Locator {
  return page.getByRole('banner').locator('[data-slot="college-name"]');
}

function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: ar.nav.label })
    .getByRole('link', { name, exact: true });
}

async function accountId(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  if (user === null) throw new Error('accountId: no such account');
  return user.id;
}

test('renaming the college shows the new names to its other users; another college is unchanged', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  const other = await createCollege(uniqueCollegeSlug('set-x'), uniqueEmail('set-x-admin'));
  const otherBefore = await getCollegeSettings(other.slug);
  const student = await registerOnboardedStudent(page, { college: college.slug });
  await signInAdmin(page, college);

  // The dashboard shortcut and the navigation entry lead to the screen.
  await page
    .locator('main [data-shortcut="settings"]')
    .getByRole('link', { name: ar.nav.admin.settings })
    .click();
  await expect(page).toHaveURL(SETTINGS_PATH);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
  await expect(navLink(page, ar.nav.admin.settings)).toHaveAttribute('aria-current', 'page');

  // The form starts from the saved settings, each text in its own direction.
  await expect(control(page, t.names.nameAr)).toHaveValue(college.nameAr);
  await expect(control(page, t.names.nameAr)).toHaveAttribute('dir', 'rtl');
  await expect(control(page, t.names.nameEn)).toHaveValue(college.nameEn);
  await expect(control(page, t.names.nameEn)).toHaveAttribute('dir', 'ltr');
  await expect(control(page, t.students.domains)).toHaveValue('');
  await expect(control(page, t.students.domains)).toHaveAttribute('dir', 'ltr');
  await expect(control(page, t.students.levelsCount)).toHaveValue('4');
  for (const key of ALL_MODULES) await expect(moduleBox(page, key)).toBeChecked();

  const studentPage = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  await signIn(studentPage, { email: student });
  await studentPage.waitForURL('/ar/dashboard');
  await expect(collegeName(studentPage)).toHaveText(college.nameAr);

  const suffix = randomBytes(3).toString('hex');
  const nameAr = `كلية الحاسبات ${suffix}`;
  const nameEn = `Faculty of Computing ${suffix}`;
  await control(page, t.names.nameAr).fill(`  ${nameAr} `);
  await control(page, t.names.nameEn).fill(nameEn);
  await saveAndExpectSaved(page);

  await expect(collegeName(page)).toHaveText(nameAr);
  await expect(control(page, t.names.nameAr)).toHaveValue(nameAr);
  await studentPage.reload();
  await expect(collegeName(studentPage)).toHaveText(nameAr);
  await studentPage.goto('/en/dashboard');
  await expect(collegeName(studentPage)).toHaveText(nameEn);
  await studentPage.context().close();

  expect(await getCollegeSettings(college.slug)).toMatchObject({
    nameAr,
    nameEn,
    allowedEmailDomains: [],
    levelsCount: 4,
    enabledModules: ALL_MODULES,
  });
  expect(await listAuditEvents(college.slug, 'tenant.settings_updated')).toEqual([
    {
      actorUserId: await accountId(college.adminEmail),
      targetId: college.tenantId,
      metadata: { fields: ['nameAr', 'nameEn'] },
    },
  ]);

  // Saving again without a change is a success that writes nothing.
  await saveAndExpectSaved(page);
  expect(await countAuditEvents(college.slug, 'tenant.settings_updated')).toBe(1);
  expect(await countAuditEvents(college.slug, 'tenant.modules_updated')).toBe(0);

  // An empty name is refused; the entered values stay on screen.
  await control(page, t.names.nameEn).fill('   ');
  await control(page, t.names.nameAr).fill(`${nameAr} 2`);
  await save(page);
  await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
    'data-code',
    'validation',
  );
  await expect(control(page, t.names.nameEn)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#settings-name-en-error')).toHaveText(ar.errors.required);
  await expect(control(page, t.names.nameAr)).toHaveValue(`${nameAr} 2`);
  expect((await getCollegeSettings(college.slug)).nameAr).toBe(nameAr);

  expect(await getCollegeSettings(other.slug)).toEqual(otherBefore);
});

test('allowed email domains restrict student registration; an empty list accepts any address', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  await signInAdmin(page, college);
  await page.goto(SETTINGS_PATH);
  const domains = control(page, t.students.domains);

  // Not a domain: refused, nothing stored, the text stays.
  await domains.fill('example.edu\nstudents@example.edu');
  await save(page);
  await expect(domains).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#settings-domains-error')).toBeVisible();
  await expect(domains).toHaveValue('example.edu\nstudents@example.edu');
  expect((await getCollegeSettings(college.slug)).allowedEmailDomains).toEqual([]);

  // Upper case, spaces, and a duplicate are normalised.
  await domains.fill('  Example.EDU \n example.edu ');
  await saveAndExpectSaved(page);
  await expect(domains).toHaveValue('example.edu');
  expect((await getCollegeSettings(college.slug)).allowedEmailDomains).toEqual(['example.edu']);

  // US1 scenario 8: another domain is refused, naming the allowed one; the allowed domain is accepted.
  const visitor = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  await registerStudent(visitor, { college: college.slug, email: uniqueEmail('outsider') });
  const email = visitor.getByLabel(ar.auth.register.email, { exact: true });
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(visitor.locator('#register-email-error')).toHaveText(ar.errors.domain_not_allowed);
  await expect(visitor.locator('#register-email-hint')).toContainText('example.edu');
  await expect(visitor).toHaveURL(new RegExp(`/ar/register\\?u=${college.slug}$`));
  await registerStudent(visitor, {
    college: college.slug,
    email: `student-${randomUUID()}@example.edu`,
  });
  await visitor.waitForURL('/ar/verify-email');

  // Cleared: any address is accepted again.
  await domains.fill('');
  await saveAndExpectSaved(page);
  expect((await getCollegeSettings(college.slug)).allowedEmailDomains).toEqual([]);
  await registerStudent(visitor, { college: college.slug, email: uniqueEmail('anyone') });
  await visitor.waitForURL('/ar/verify-email');
  await visitor.context().close();

  const events = await listAuditEvents(college.slug, 'tenant.settings_updated');
  expect(events.map((event) => event.metadata)).toEqual([
    { fields: ['allowedEmailDomains'] },
    { fields: ['allowedEmailDomains'] },
  ]);
});

test('the number of levels cannot go below the highest level a student holds', async ({ page }) => {
  const college = await newCollege();
  const student = uniqueEmail('level-four');
  await registerStudent(page, { college: college.slug, email: student });
  await page.waitForURL('/ar/verify-email');
  await createStudentProfile(student, { studentCode: uniqueStudentCode(), level: 4 });
  await signInAdmin(page, college);
  await page.goto(SETTINGS_PATH);
  const levels = control(page, t.students.levelsCount);

  await levels.selectOption('3');
  await save(page);
  await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
    'data-code',
    'validation',
  );
  await expect(levels).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#settings-levels-error')).toHaveText(
    t.students.levelsInUse.replaceAll('{min}', '4'),
  );
  await expect(levels).toHaveValue('3');
  expect((await getCollegeSettings(college.slug)).levelsCount).toBe(4);
  expect(await countAuditEvents(college.slug, 'tenant.settings_updated')).toBe(0);

  await levels.selectOption('6');
  await saveAndExpectSaved(page);
  expect((await getCollegeSettings(college.slug)).levelsCount).toBe(6);
  // Down to the highest level in use is allowed.
  await levels.selectOption('4');
  await saveAndExpectSaved(page);
  await expect(levels).toHaveValue('4');
  expect((await getCollegeSettings(college.slug)).levelsCount).toBe(4);
  expect(await countAuditEvents(college.slug, 'tenant.settings_updated')).toBe(2);
});

test('a disabled module disappears for every role and is not found; enabling it restores it', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  const student = await registerOnboardedStudent(page, { college: college.slug });
  await signInAdmin(page, college);
  const studentPage = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  await signIn(studentPage, { email: student });
  await studentPage.waitForURL('/ar/dashboard');
  const kitabi = ar.modules.kitabi.name;

  await page.goto(SETTINGS_PATH);
  await moduleBox(page, 'kitabi').uncheck();
  await saveAndExpectSaved(page);
  await expect(moduleBox(page, 'kitabi')).not.toBeChecked();
  const remaining = ALL_MODULES.filter((key) => key !== 'kitabi');
  expect((await getCollegeSettings(college.slug)).enabledModules).toEqual(remaining);
  expect(await listAuditEvents(college.slug, 'tenant.modules_updated')).toEqual([
    {
      actorUserId: await accountId(college.adminEmail),
      targetId: college.tenantId,
      metadata: { enabled: remaining },
    },
  ]);
  expect(await countAuditEvents(college.slug, 'tenant.settings_updated')).toBe(0);

  for (const user of [page, studentPage]) {
    await user.goto('/ar/dashboard');
    await expect(navLink(user, kitabi)).toHaveCount(0);
    await expect(user.locator('main [data-module="kitabi"]')).toHaveCount(0);
    // The other modules of the role stay (Tadreeb is offered to students and the administration).
    await expect(user.locator('main [data-module="tadreeb"]')).toHaveCount(1);
    const response = await user.goto('/ar/modules/kitabi');
    expect(response?.status()).toBe(404);
    await expect(user.getByRole('heading', { level: 1 })).toHaveText(ar.common.notFound.title);
  }

  await page.goto(SETTINGS_PATH);
  await moduleBox(page, 'kitabi').check();
  await saveAndExpectSaved(page);
  expect((await getCollegeSettings(college.slug)).enabledModules).toEqual(ALL_MODULES);
  expect(await countAuditEvents(college.slug, 'tenant.modules_updated')).toBe(2);

  for (const user of [page, studentPage]) {
    await user.goto('/ar/dashboard');
    await expect(navLink(user, kitabi)).toHaveCount(1);
    await expect(user.locator('main [data-module="kitabi"]')).toHaveCount(1);
    const response = await user.goto('/ar/modules/kitabi');
    expect(response?.status()).toBe(200);
    await expect(user.getByRole('heading', { level: 1 })).toHaveText(kitabi);
  }
  await studentPage.context().close();
});
