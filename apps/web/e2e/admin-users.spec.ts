import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createStudentProfile, setUserStatus } from './support/db';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  registerStudent,
  signIn,
  uniqueEmail,
  uniqueStudentCode,
  type TestLocale,
} from './support/flows';
import { createCollege, uniqueCollegeSlug, type OnboardedCollege } from './support/operator';

// The People screen (US6 acceptance scenario 1; contracts/routes.md §4; FR-029). Part 1: the list — only
// the administrator's own college, search by part of a name, email, or student code, filters by role and
// status (also without JavaScript), 20 per page with pagination that keeps the filters, and invalid
// parameters ignored. Each test builds a college of its own, so its counts are exact.

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
