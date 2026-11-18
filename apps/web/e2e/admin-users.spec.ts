import { randomBytes } from 'node:crypto';
import type { Browser, Locator, Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import {
  countAuditEvents,
  countSessions,
  createStudentProfile,
  getStudentProfile,
  getUserByEmail,
  listAuditEvents,
  setUserStatus,
} from './support/db';
import { firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  INVITATION_SUBJECT,
  inviteStaff,
  registerConfirmedStudent,
  registerStudent,
  signIn,
  uniqueEmail,
  uniqueStudentCode,
  type TestLocale,
} from './support/flows';
import { setFormField } from './support/forge';
import { createCollege, uniqueCollegeSlug, type OnboardedCollege } from './support/operator';
import {
  clickAndWait,
  openDialog,
  profileDialog,
  profileTrigger,
  reactivateButton,
  roleDialog,
  roleTrigger,
  suspendDialog,
  suspendTrigger,
  userRow,
} from './support/people';

// The People screen (contracts/routes.md §4). Part 1 (US6 acceptance scenario 1; FR-029): the list — only
// the administrator's own college, search by part of a name, email, or student code, filters by role and
// status (also without JavaScript), 20 per page with pagination that keeps the filters, and invalid
// parameters ignored. Part 2 (US6 acceptance scenarios 2, 3, 4, 6; FR-030, FR-031): role change and
// suspension from the row actions, refused on the own account and for another college's account. Part 3
// (US6 acceptance scenario 5; FR-028): correcting a student's academic data, refused for a code in use, an
// account that is not a student, and another college's student. Each test builds a college of its own, so
// its counts are exact.

const { ar, en } = CATALOGS;

/** Names of the GEN division every college is created with (packages/db admin/tenants.ts). */
const GEN_DIVISION = { ar: 'عام', en: 'General' } as const;

// One test registers 21 students through the screens.
test.describe.configure({ timeout: 180_000 });

function rows(page: Page) {
  return page.locator('main [data-slot="users-table"] tbody tr');
}

function emailCells(page: Page) {
  return rows(page).locator('[data-field="email"]');
}

function filtersForm(page: Page, locale: TestLocale = 'ar') {
  return page.getByRole('search', { name: CATALOGS[locale].admin.users.filters.label });
}

function pageStatus(page: Page) {
  return page.locator('main [data-slot="users-page-status"]');
}

function countText(count: number, locale: TestLocale = 'ar'): string {
  return CATALOGS[locale].admin.users.list.count.replace('{count}', String(count));
}

function statusText(page: number, pages: number): string {
  return ar.admin.users.pagination.status
    .replace('{page}', String(page))
    .replace('{pages}', String(pages));
}

type Filters = { q?: string; role?: string; status?: string };

/** Fills the filters form on screen, submits it, and waits for the URL carrying exactly those filters. */
async function applyFilters(page: Page, filters: Filters): Promise<void> {
  const t = ar.admin.users.filters;
  const form = filtersForm(page);
  await form.getByLabel(t.search, { exact: true }).fill(filters.q ?? '');
  await form.getByLabel(t.role, { exact: true }).selectOption(filters.role ?? '');
  await form.getByLabel(t.status, { exact: true }).selectOption(filters.status ?? '');
  await form.getByRole('button', { name: t.submit }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === '/ar/admin/users' &&
      url.searchParams.get('q') === (filters.q ?? '') &&
      url.searchParams.get('role') === (filters.role ?? '') &&
      url.searchParams.get('status') === (filters.status ?? '') &&
      !url.searchParams.has('page'),
  );
}

/** Registers a student of `college` through the screens (unconfirmed: the list shows every account). */
async function registerIn(page: Page, college: OnboardedCollege, name: string): Promise<string> {
  const email = uniqueEmail('people');
  await registerStudent(page, { college: college.slug, email, name });
  await page.waitForURL('/ar/verify-email');
  return email;
}

/** The college's first administrator accepts the operator's invitation and signs in (ends on /ar/dashboard). */
async function signInAdmin(
  page: Page,
  college: OnboardedCollege,
  adminEmail: string,
  name: string,
) {
  await acceptInvitation(page, { invitePath: college.invitePath, name });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signIn(page, { email: adminEmail, open: false });
  await page.waitForURL('/ar/dashboard');
}

test('lists only the own college, searches by name, email, and code, and filters by role and status', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const token = randomBytes(4).toString('hex');
  const code = uniqueStudentCode();
  const adminEmail = uniqueEmail('people-admin');
  const college = await createCollege(uniqueCollegeSlug('people'), adminEmail);
  const other = await createCollege(uniqueCollegeSlug('people-x'), uniqueEmail('people-x-admin'));

  // Oldest first: Mona, Omar, then the administrator (accepted last). Another college has a student with
  // the same name and the same student code.
  const mona = await registerIn(page, college, `Mona ${token}`);
  await createStudentProfile(mona, { studentCode: code });
  const omar = await registerIn(page, college, `Omar ${token}`);
  await setUserStatus(omar, 'suspended');
  const stranger = await registerIn(page, other, `Mona ${token}`);
  await createStudentProfile(stranger, { studentCode: code });
  await signInAdmin(page, college, adminEmail, `Admin ${token}`);

  // The navigation entry and the dashboard shortcut lead to the screen.
  await page
    .locator('main [data-shortcut="users"]')
    .getByRole('link', { name: ar.nav.admin.users })
    .click();
  await expect(page).toHaveURL('/ar/admin/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.admin.users.title);
  await expect(
    page
      .getByRole('navigation', { name: ar.nav.label })
      .getByRole('link', { name: ar.nav.admin.users, exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  // Newest first, own college only, with each column.
  await expect(emailCells(page)).toHaveText([adminEmail, omar, mona]);
  await expect(page.locator('main [data-slot="users-count"]')).toHaveText(countText(3));
  await expect(page.locator('main')).not.toContainText(stranger);
  await expect(page.locator('main [data-slot="users-pagination"]')).toHaveCount(0);
  const monaRow = rows(page).filter({ hasText: mona });
  await expect(monaRow.locator('[data-field="name"]')).toHaveText(`Mona ${token}`);
  await expect(monaRow.locator('[data-field="role"]')).toHaveText(ar.common.roles.student);
  await expect(monaRow.locator('[data-field="status"]')).toHaveText(ar.common.statuses.active);
  await expect(monaRow.locator('[data-field="studentCode"]')).toHaveText(code);
  await expect(monaRow.locator('[data-field="level"]')).toHaveText(ar.common.levels['1']);
  await expect(monaRow.locator('[data-field="division"]')).toHaveText(GEN_DIVISION.ar);
  await expect(monaRow.locator('[data-field="email"] bdi')).toHaveAttribute('dir', 'ltr');
  const omarRow = rows(page).filter({ hasText: omar });
  await expect(omarRow.locator('[data-field="status"]')).toHaveText(ar.common.statuses.suspended);
  // No academic profile: a dash, read as "none".
  await expect(omarRow.locator('[data-field="studentCode"]')).toHaveText(
    `—${ar.admin.users.list.none}`,
  );
  const adminRow = rows(page).filter({ hasText: adminEmail });
  await expect(adminRow.locator('[data-field="role"]')).toHaveText(ar.common.roles.admin);

  // Search by part of a name (any case), of an email, of a student code (the other college has the same).
  await applyFilters(page, { q: `ONA ${token}` });
  await expect(emailCells(page)).toHaveText([mona]);
  await expect(filtersForm(page).getByLabel(ar.admin.users.filters.search)).toHaveValue(
    `ONA ${token}`,
  );
  await applyFilters(page, { q: omar.split('@')[0]?.slice(-12) ?? omar });
  await expect(emailCells(page)).toHaveText([omar]);
  await applyFilters(page, { q: code.slice(2).toUpperCase() });
  await expect(emailCells(page)).toHaveText([mona]);
  await expect(page.locator('main [data-slot="users-count"]')).toHaveText(countText(1));
  await applyFilters(page, { q: `nobody-${token}` });
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('main [data-slot="users-empty"]')).toHaveText(
    ar.admin.users.list.empty,
  );

  // Filters by role and by status, alone and together, and with a search.
  await applyFilters(page, { role: 'student' });
  await expect(emailCells(page)).toHaveText([omar, mona]);
  await applyFilters(page, { status: 'suspended' });
  await expect(emailCells(page)).toHaveText([omar]);
  await applyFilters(page, { role: 'student', status: 'active' });
  await expect(emailCells(page)).toHaveText([mona]);
  await applyFilters(page, { q: token, role: 'admin' });
  await expect(emailCells(page)).toHaveText([adminEmail]);
  await expect(filtersForm(page).getByLabel(ar.admin.users.filters.role)).toHaveValue('admin');

  // "Clear filters" shows everyone again, with empty controls.
  await page.locator('main [data-slot="users-clear"]').click();
  await expect(page).toHaveURL('/ar/admin/users');
  await expect(emailCells(page)).toHaveText([adminEmail, omar, mona]);
  await expect(filtersForm(page).getByLabel(ar.admin.users.filters.search)).toHaveValue('');
  await expect(filtersForm(page).getByLabel(ar.admin.users.filters.role)).toHaveValue('');

  // Invalid parameters are ignored.
  await page.goto('/ar/admin/users?role=owner&status=deleted&q=');
  await expect(emailCells(page)).toHaveText([adminEmail, omar, mona]);

  // The same filters without JavaScript (the form is a plain GET form).
  const noScript = await browser.newContext({
    baseURL,
    extraHTTPHeaders,
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const plain = await noScript.newPage();
    await plain.goto('/ar/admin/users');
    await applyFilters(plain, { q: token, role: 'student', status: 'suspended' });
    await expect(emailCells(plain)).toHaveText([omar]);
    await applyFilters(plain, { q: code.slice(2) });
    await expect(emailCells(plain)).toHaveText([mona]);
  } finally {
    await noScript.close();
  }

  // English: the level and the division in English, the email still left-to-right.
  await page.goto(`/en/admin/users?q=${encodeURIComponent(code)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.admin.users.title);
  await expect(emailCells(page)).toHaveText([mona]);
  await expect(rows(page).locator('[data-field="level"]')).toHaveText(en.common.levels['1']);
  await expect(rows(page).locator('[data-field="division"]')).toHaveText(GEN_DIVISION.en);
  await expect(page.locator('main [data-slot="users-count"]')).toHaveText(countText(1, 'en'));
});

test('shows 20 accounts per page; pagination keeps the filters; an invalid page is page 1', async ({
  page,
}) => {
  const token = randomBytes(4).toString('hex');
  const adminEmail = uniqueEmail('paged-admin');
  const college = await createCollege(uniqueCollegeSlug('paged'), adminEmail);
  // 21 students (oldest first) and the administrator: 22 accounts, 21 of them matching the token.
  const students: string[] = [];
  for (let index = 0; index < 21; index += 1) {
    students.push(await registerIn(page, college, `Paged ${token} ${index}`));
  }
  await signInAdmin(page, college, adminEmail, 'Paged Administrator');
  const newestFirst = [...students].reverse();

  await page.goto('/ar/admin/users');
  await expect(rows(page)).toHaveCount(20);
  await expect(emailCells(page)).toHaveText([adminEmail, ...newestFirst.slice(0, 19)]);
  await expect(page.locator('main [data-slot="users-count"]')).toHaveText(countText(22));
  await expect(pageStatus(page)).toHaveText(statusText(1, 2));
  await expect(page.locator('main [data-slot="users-previous"]')).toHaveCount(0);
  const pagination = page.getByRole('navigation', { name: ar.admin.users.pagination.label });
  await pagination.getByRole('link', { name: ar.admin.users.pagination.next }).click();
  await expect(page).toHaveURL('/ar/admin/users?page=2');
  await expect(emailCells(page)).toHaveText(newestFirst.slice(19));
  await expect(pageStatus(page)).toHaveText(statusText(2, 2));
  await expect(page.locator('main [data-slot="users-next"]')).toHaveCount(0);

  // A search: 21 matches on two pages; the links keep the search, and so does the form.
  await applyFilters(page, { q: token, role: 'student' });
  await expect(rows(page)).toHaveCount(20);
  await expect(pageStatus(page)).toHaveText(statusText(1, 2));
  const next = page.locator('main [data-slot="users-next"]');
  await expect(next).toHaveAttribute('href', `/ar/admin/users?q=${token}&role=student&page=2`);
  await next.click();
  await expect(page).toHaveURL(`/ar/admin/users?q=${token}&role=student&page=2`);
  await expect(emailCells(page)).toHaveText([students[0] ?? '']);
  await expect(filtersForm(page).getByLabel(ar.admin.users.filters.search)).toHaveValue(token);
  await expect(page.locator('main [data-slot="users-previous"]')).toHaveAttribute(
    'href',
    `/ar/admin/users?q=${token}&role=student`,
  );

  // Invalid pages are page 1; a page past the end goes to the last page.
  for (const invalid of ['abc', '0', '-2', '1.5', '99999999']) {
    const response = await page.goto(`/ar/admin/users?page=${invalid}`);
    expect(response?.status()).toBe(200);
    await expect(pageStatus(page)).toHaveText(statusText(1, 2));
    await expect(rows(page)).toHaveCount(20);
  }
  await page.goto(`/ar/admin/users?q=${token}&page=9`);
  await expect(page).toHaveURL(`/ar/admin/users?q=${token}&page=2`);
  await expect(emailCells(page)).toHaveText([students[0] ?? '']);
});

// ---------------------------------------------------------------------------------------------------------
// Part 2: row actions (PR-33)

const tActions = ar.admin.users.actions;
const USERS_PATH = '/ar/admin/users';

type ContextOptions = {
  baseURL: string | undefined;
  extraHTTPHeaders: Record<string, string> | undefined;
};

/** A second browser (another person's), with the test's client address. */
async function otherBrowser(browser: Browser, options: ContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

/** The account's stored id (it must exist). */
async function userId(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  if (user === null) throw new Error('userId: no such account');
  return user.id;
}

/** The links of the signed-in navigation, in order. */
function navLinks(page: Page): Locator {
  return page.getByRole('navigation', { name: ar.nav.label }).getByRole('link');
}

/** Focus stays inside `dialog` through `count` presses of Tab, then of Shift+Tab. */
async function expectFocusTrapped(page: Page, dialog: Locator, count = 6): Promise<void> {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 0; press < count; press += 1) {
      await page.keyboard.press(key);
      await expect(dialog.locator(':focus')).toHaveCount(1);
    }
  }
}

/** The form's error summary shows `code`. */
async function expectFormError(form: Locator, code: 'forbidden' | 'not_found'): Promise<void> {
  const error = form.locator('[data-slot="form-error"]');
  await expect(error).toHaveAttribute('data-code', code);
  await expect(error).toContainText(ar.errors[code]);
}

/** A student of another college (registered through the screens); returns the address. */
async function strangerOfAnotherCollege(page: Page): Promise<string> {
  const other = await createCollege(uniqueCollegeSlug('people-o'), uniqueEmail('people-o-admin'));
  return registerIn(page, other, 'Stranger Student');
}

test('changes another user’s role, which applies on their next page; own row has no actions; forged ids are refused', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const adminEmail = uniqueEmail('role-admin');
  const facultyEmail = uniqueEmail('role-faculty');
  const college = await createCollege(uniqueCollegeSlug('role'), adminEmail);
  const stranger = await strangerOfAnotherCollege(page);
  await signInAdmin(page, college, adminEmail, 'Role Administrator');

  // The administrator invites a faculty member, who accepts and signs in in their own browser.
  const since = new Date();
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email: facultyEmail, role: 'faculty' });
  await expect(page.locator('main [data-slot="invite-sent"]')).toBeVisible();
  const message = await waitForEmail({
    to: facultyEmail,
    subjectIncludes: INVITATION_SUBJECT,
    since,
  });
  const faculty = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  try {
    await faculty.goto(firstLink(message));
    await acceptInvitation(faculty, { invitePath: '', open: false, name: 'Faculty Member' });
    await faculty.waitForURL('/ar/sign-in?invited=1');
    await signIn(faculty, { email: facultyEmail, open: false });
    await faculty.waitForURL('/ar/dashboard');
    await expect(navLinks(faculty)).toHaveText([
      ar.nav.home,
      ar.modules.codejudge.name,
      ar.modules.mizan.name,
    ]);

    // The administrator's own row has no actions (never on the own account).
    await page.goto(USERS_PATH);
    const ownRow = userRow(page, adminEmail);
    await expect(ownRow.locator('[data-slot="own-account"]')).toHaveText(tActions.self);
    await expect(ownRow.getByRole('button')).toHaveCount(0);

    // The dialog traps focus, closes on Escape, and gives focus back to its trigger.
    const row = userRow(page, facultyEmail);
    const trigger = roleTrigger(row);
    await openDialog(trigger, roleDialog(page));
    await expectFocusTrapped(page, roleDialog(page));
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expect(roleDialog(page)).toBeHidden();
    await expect(trigger).toBeFocused();

    // Faculty → Student Affairs.
    const form = await openDialog(trigger, roleDialog(page));
    const roleSelect = form.getByLabel(tActions.role.label, { exact: true });
    await expect(roleSelect).toHaveValue('faculty');
    await roleSelect.selectOption('student_affairs');
    await clickAndWait(page, USERS_PATH, form.getByRole('button', { name: tActions.role.submit }));
    await expect(roleDialog(page)).toBeHidden();
    await expect(row.locator('[data-field="role"]')).toHaveText(ar.common.roles.student_affairs);
    await expect(row.locator('[data-slot="role-status"]')).toHaveText(tActions.role.done);
    const facultyId = await userId(facultyEmail);
    expect((await getUserByEmail(facultyEmail))?.role).toBe('student_affairs');
    expect(await countAuditEvents(college.slug, 'user.role_changed', facultyId)).toBe(1);

    // The target's very next page load has the new role's navigation.
    await faculty.reload();
    await expect(navLinks(faculty)).toHaveText([ar.nav.home, ar.modules.mueed.name]);

    // Forged: the administrator's own id → forbidden; another college's account → not_found. No change.
    const adminId = await userId(adminEmail);
    const strangerId = await userId(stranger);
    const changesBefore = await countAuditEvents(college.slug, 'user.role_changed');
    for (const [forgedId, code] of [
      [adminId, 'forbidden'],
      [strangerId, 'not_found'],
    ] as const) {
      const forged = await openDialog(trigger, roleDialog(page));
      await forged.getByLabel(tActions.role.label, { exact: true }).selectOption('student');
      await setFormField(forged, 'userId', forgedId);
      await clickAndWait(
        page,
        USERS_PATH,
        forged.getByRole('button', { name: tActions.role.submit }),
      );
      await expectFormError(forged, code);
      await page.keyboard.press('Escape');
      await expect(roleDialog(page)).toBeHidden();
    }
    expect((await getUserByEmail(adminEmail))?.role).toBe('admin');
    expect((await getUserByEmail(stranger))?.role).toBe('student');
    expect((await getUserByEmail(facultyEmail))?.role).toBe('student_affairs');
    expect(await countAuditEvents(college.slug, 'user.role_changed')).toBe(changesBefore);
  } finally {
    await faculty.context().close();
  }
});

test('suspending ends the sessions and blocks sign-in; reactivating restores sign-in, not the sessions; forged ids are refused', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const adminEmail = uniqueEmail('suspend-admin');
  const college = await createCollege(uniqueCollegeSlug('suspend'), adminEmail);
  const stranger = await strangerOfAnotherCollege(page);
  await signInAdmin(page, college, adminEmail, 'Suspend Administrator');

  // A student of the college, signed in in their own browser.
  const student = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  try {
    const studentEmail = await registerConfirmedStudent(student, {
      college: college.slug,
      name: 'Suspended Student',
    });
    await createStudentProfile(studentEmail, { studentCode: uniqueStudentCode() });
    await signIn(student, { email: studentEmail });
    await student.waitForURL('/ar/dashboard');
    expect(await countSessions(studentEmail)).toBeGreaterThan(0);
    const studentId = await userId(studentEmail);

    // Suspend asks for confirmation; Escape cancels it and gives focus back to the button.
    await page.goto(USERS_PATH);
    const row = userRow(page, studentEmail);
    await openDialog(suspendTrigger(row), suspendDialog(page));
    await expect(suspendDialog(page)).toContainText('Suspended Student');
    await expectFocusTrapped(page, suspendDialog(page));
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expect(suspendDialog(page)).toBeHidden();
    await expect(suspendTrigger(row)).toBeFocused();
    expect((await getUserByEmail(studentEmail))?.status).toBe('active');

    const form = await openDialog(suspendTrigger(row), suspendDialog(page));
    await clickAndWait(
      page,
      USERS_PATH,
      form.getByRole('button', { name: tActions.suspend.submit }),
    );
    await expect(suspendDialog(page)).toBeHidden();
    await expect(row.locator('[data-field="status"]')).toHaveText(ar.common.statuses.suspended);
    // The row's button is now "Reactivate", and keyboard focus is on it.
    await expect(reactivateButton(row)).toBeFocused();
    expect((await getUserByEmail(studentEmail))?.status).toBe('suspended');
    expect(await countSessions(studentEmail)).toBe(0);
    expect(await countAuditEvents(college.slug, 'user.suspended', studentId)).toBe(1);

    // The student's open browser is sent to sign-in on the next navigation …
    await student.goto('/ar/dashboard');
    await expect(student).toHaveURL('/ar/sign-in?next=%2Fdashboard');
    // … a wrong password says nothing about the suspension; the right one does, and opens no session.
    const studentError = student.locator('main [data-slot="form-error"]');
    await signIn(student, { email: studentEmail, password: 'Zz9'.repeat(4), open: false });
    await expect(studentError).toHaveAttribute('data-code', 'invalid_credentials');
    await signIn(student, { email: studentEmail, open: false });
    await expect(studentError).toHaveAttribute('data-code', 'account_suspended');
    await expect(studentError).toContainText(ar.errors.account_suspended);
    expect(await countSessions(studentEmail)).toBe(0);

    // Reactivate: sign-in works again, but the ended sessions stay ended.
    await clickAndWait(page, USERS_PATH, reactivateButton(row));
    await expect(row.locator('[data-field="status"]')).toHaveText(ar.common.statuses.active);
    await expect(suspendTrigger(row)).toBeFocused();
    expect(await countAuditEvents(college.slug, 'user.reactivated', studentId)).toBe(1);
    expect(await countSessions(studentEmail)).toBe(0);
    await student.goto('/ar/dashboard');
    await expect(student).toHaveURL('/ar/sign-in?next=%2Fdashboard');
    await signIn(student, { email: studentEmail, open: false });
    await student.waitForURL('/ar/dashboard');

    // Forged: suspending the own account → forbidden; another college's account → not_found. No change.
    const adminId = await userId(adminEmail);
    const strangerId = await userId(stranger);
    const adminSessions = await countSessions(adminEmail);
    const suspendedBefore = await countAuditEvents(college.slug, 'user.suspended');
    for (const [forgedId, code] of [
      [adminId, 'forbidden'],
      [strangerId, 'not_found'],
    ] as const) {
      const forged = await openDialog(suspendTrigger(row), suspendDialog(page));
      await setFormField(forged, 'userId', forgedId);
      await clickAndWait(
        page,
        USERS_PATH,
        forged.getByRole('button', { name: tActions.suspend.submit }),
      );
      await expectFormError(forged, code);
      await page.keyboard.press('Escape');
      await expect(suspendDialog(page)).toBeHidden();
    }
    expect((await getUserByEmail(adminEmail))?.status).toBe('active');
    expect(await countSessions(adminEmail)).toBe(adminSessions);
    expect((await getUserByEmail(stranger))?.status).toBe('active');
    expect((await getUserByEmail(studentEmail))?.status).toBe('active');
    expect(await countAuditEvents(college.slug, 'user.suspended')).toBe(suspendedBefore);
  } finally {
    await student.context().close();
  }
});

test('at 1280 px the whole table fits, row actions included, and emails offer breaks after @ and before each dot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const token = randomBytes(3).toString('hex');
  // Realistic addresses and names (not the long generated ones), like a college's real data.
  const adminEmail = `shot.admin.${token}@example.edu`;
  const college = await createCollege(uniqueCollegeSlug('fit'), adminEmail);
  const active = `mona.hassan.${token}@student.example.edu`;
  const suspended = `omar.farouk.${token}@student.example.edu`;
  for (const [email, name] of [
    [active, 'منى حسن عبد الرحمن'],
    [suspended, 'عمر فاروق السيد'],
  ] as const) {
    await registerStudent(page, { college: college.slug, email, name });
    await page.waitForURL('/ar/verify-email');
    await createStudentProfile(email, { studentCode: uniqueStudentCode() });
  }
  await setUserStatus(suspended, 'suspended');
  await signInAdmin(page, college, adminEmail, 'Shot Administrator');

  for (const locale of ['ar', 'en'] as const) {
    await page.goto(`/${locale}/admin/users`);
    const region = page.getByRole('region', {
      name: CATALOGS[locale].admin.users.list.title,
      exact: true,
    });
    await expect(rows(page)).toHaveCount(3);
    // No sideways scrolling: every column, Actions included, is in the content column.
    expect(await region.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    const regionBox = await region.boundingBox();
    expect(regionBox).not.toBeNull();
    const buttons = rows(page).locator('[data-field="actions"]').getByRole('button');
    // Two students: change role, suspend or reactivate, and academic data each.
    await expect(buttons).toHaveCount(6);
    for (const button of await buttons.all()) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (box !== null && regionBox !== null) {
        expect(box.x).toBeGreaterThanOrEqual(regionBox.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(regionBox.x + regionBox.width + 1);
      }
    }
    // Break points only after the @ and before each dot.
    await expect(
      rows(page).filter({ hasText: active }).locator('[data-field="email"] wbr'),
    ).toHaveCount(active.split('.').length);
  }
});

// ---------------------------------------------------------------------------------------------------------
// Part 3: a student's academic data (PR-34)

test('corrects a student’s code and level, shown in the list and on their dashboard; a code in use and forged targets are refused', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const tProfile = tActions.profile;
  const adminEmail = uniqueEmail('academic-admin');
  const college = await createCollege(uniqueCollegeSlug('academic'), adminEmail);
  const stranger = await strangerOfAnotherCollege(page);
  const strangerCode = uniqueStudentCode();
  await createStudentProfile(stranger, { studentCode: strangerCode });
  // Another student of the college, whose code is already in use.
  const takenCode = uniqueStudentCode();
  const otherEmail = await registerIn(page, college, 'Other Student');
  await createStudentProfile(otherEmail, { studentCode: takenCode });
  await signInAdmin(page, college, adminEmail, 'Academic Administrator');

  // The student, signed in in their own browser: level 1, the GEN division.
  const student = await otherBrowser(browser, { baseURL, extraHTTPHeaders });
  try {
    const studentEmail = await registerConfirmedStudent(student, {
      college: college.slug,
      name: 'Corrected Student',
    });
    const oldCode = uniqueStudentCode();
    await createStudentProfile(studentEmail, { studentCode: oldCode });
    await signIn(student, { email: studentEmail });
    await student.waitForURL('/ar/dashboard');
    const summary = student.locator('main [data-slot="student-summary"]');
    await expect(summary.locator('[data-field="studentCode"]')).toHaveText(oldCode);
    const studentId = await userId(studentEmail);
    const adminId = await userId(adminEmail);

    // The dialog starts from the saved values, traps focus, and closes on Escape.
    await page.goto(USERS_PATH);
    const row = userRow(page, studentEmail);
    const trigger = profileTrigger(row);
    await openDialog(trigger, profileDialog(page));
    await expectFocusTrapped(page, profileDialog(page));
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expect(profileDialog(page)).toBeHidden();
    await expect(trigger).toBeFocused();

    const form = await openDialog(trigger, profileDialog(page));
    const code = form.getByLabel(ar.onboarding.studentCode, { exact: true });
    const level = form.getByLabel(ar.onboarding.level, { exact: true });
    const division = form.getByLabel(ar.onboarding.division, { exact: true });
    await expect(code).toHaveValue(oldCode);
    await expect(level).toHaveValue('1');
    await expect(division.locator('option:checked')).toHaveText(GEN_DIVISION.ar);
    const submit = form.getByRole('button', { name: tProfile.submit });

    // A code another student of the college has → student_code_taken; the entered code stays; no change.
    await code.fill(takenCode);
    await clickAndWait(page, USERS_PATH, submit);
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(form).toContainText(ar.errors.student_code_taken);
    await expect(code).toHaveValue(takenCode);
    expect((await getStudentProfile(studentEmail))?.studentCode).toBe(oldCode);
    expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(0);

    // Correct the code and the level.
    const newCode = uniqueStudentCode();
    await code.fill(newCode);
    await level.selectOption('2');
    await clickAndWait(page, USERS_PATH, submit);
    await expect(profileDialog(page)).toBeHidden();
    await expect(row.locator('[data-field="studentCode"]')).toHaveText(newCode);
    await expect(row.locator('[data-field="level"]')).toHaveText(ar.common.levels['2']);
    await expect(row.locator('[data-slot="student-profile-status"]')).toHaveText(tProfile.done);
    expect(await getStudentProfile(studentEmail)).toEqual({
      studentCode: newCode,
      level: 2,
      divisionCode: 'GEN',
    });
    // One audit row: the administrator acted, and it lists the changed fields only.
    expect(await listAuditEvents(college.slug, 'profile.updated')).toEqual([
      { actorUserId: adminId, targetId: studentId, metadata: { fields: ['studentCode', 'level'] } },
    ]);

    // The student's dashboard shows the correction.
    await student.reload();
    await expect(summary.locator('[data-field="studentCode"]')).toHaveText(newCode);
    await expect(summary.locator('[data-field="level"]')).toHaveText(ar.common.levels['2']);

    // Forged: an account that is not a student (the administrator's own) and another college's student →
    // not_found. Nothing changes.
    for (const forgedId of [adminId, await userId(stranger)]) {
      const forged = await openDialog(trigger, profileDialog(page));
      await forged.getByLabel(ar.onboarding.studentCode, { exact: true }).fill(uniqueStudentCode());
      await setFormField(forged, 'userId', forgedId);
      await clickAndWait(page, USERS_PATH, forged.getByRole('button', { name: tProfile.submit }));
      await expectFormError(forged, 'not_found');
      await page.keyboard.press('Escape');
      await expect(profileDialog(page)).toBeHidden();
    }
    expect(await getStudentProfile(adminEmail)).toBeNull();
    expect((await getStudentProfile(stranger))?.studentCode).toBe(strangerCode);
    expect((await getStudentProfile(studentEmail))?.studentCode).toBe(newCode);
    expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(1);
    expect(await countAuditEvents(college.slug, 'profile.created')).toBe(0);
  } finally {
    await student.context().close();
  }
});
