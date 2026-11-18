import type { Browser, Locator, Page } from '@playwright/test';
import {
  countAuditEvents,
  createStudentProfile,
  getStudentProfile,
  getUserByEmail,
  listAuditEvents,
  listDivisions,
} from './support/db';
import {
  addDivisionForm,
  divisionRow,
  divisionStatusForm,
  editDivisionDialog,
  editDivisionTrigger,
} from './support/divisions';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  registerConfirmedStudent,
  signIn,
  uniqueEmail,
  uniqueStudentCode,
} from './support/flows';
import { setFormField } from './support/forge';
import { createCollege, uniqueCollegeSlug, type OnboardedCollege } from './support/operator';
import { clickAndWait, openDialog } from './support/people';
import { registerStudentWithProfile } from './support/students';

// The divisions screen (US7 acceptance scenarios 4–5; contracts/server-actions.md §5.5; FR-033, FR-044).
// Every test works in a college of its own (contracts/ci.md §3), so its audit counts are exact. There is
// no delete control: a division is deactivated and reactivated.

const { ar } = CATALOGS;
const t = ar.admin.divisions;
const DIVISIONS_PATH = '/ar/admin/divisions';

// Tests register students through the screens before the administrator works.
test.describe.configure({ timeout: 120_000 });

type ContextOptions = {
  baseURL: string | undefined;
  extraHTTPHeaders: Record<string, string> | undefined;
};

type AdminCollege = OnboardedCollege & { adminEmail: string };

async function newCollege(): Promise<AdminCollege> {
  const adminEmail = uniqueEmail('div-admin');
  return { ...(await createCollege(uniqueCollegeSlug('div'), adminEmail)), adminEmail };
}

/** The college's first administrator accepts the operator's invitation and signs in (ends on /ar/dashboard). */
async function signInAdmin(page: Page, college: AdminCollege): Promise<void> {
  await acceptInvitation(page, { invitePath: college.invitePath });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signIn(page, { email: college.adminEmail, open: false });
  await page.waitForURL('/ar/dashboard');
}

/** Another person's browser, signed in as the student `email` on the dashboard. */
async function studentBrowser(
  browser: Browser,
  options: ContextOptions,
  email: string,
): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
  return page;
}

/** The division picker of the student's profile screen (opens the screen afresh). */
async function profileDivisionPicker(page: Page): Promise<Locator> {
  await page.goto('/ar/profile');
  return page
    .locator('main [data-slot="academic"] form')
    .getByLabel(ar.onboarding.division, { exact: true });
}

async function addDivision(
  page: Page,
  input: { code: string; nameAr: string; nameEn: string; sortOrder?: string },
): Promise<void> {
  const form = addDivisionForm(page);
  const code = form.getByLabel(t.form.code, { exact: true });
  // After a success React empties the form a moment after the action's answer: wait for it, or the late
  // reset would wipe what is typed next. (The form is empty on a fresh screen too; call this only then.)
  await expect(code).toHaveValue('');
  await code.fill(input.code);
  await form.getByLabel(t.form.nameAr, { exact: true }).fill(input.nameAr);
  await form.getByLabel(t.form.nameEn, { exact: true }).fill(input.nameEn);
  await form.getByLabel(t.form.sortOrder, { exact: true }).fill(input.sortOrder ?? '0');
  await clickAndWait(page, DIVISIONS_PATH, form.getByRole('button', { name: t.form.submit }));
}

function rowCodes(page: Page): Promise<(string | null)[]> {
  return page
    .locator('main [data-slot="divisions-table"] tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-code')));
}

async function accountId(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  if (user === null) throw new Error('accountId: no such account');
  return user.id;
}

async function setActive(page: Page, code: string, action: 'deactivate' | 'activate') {
  const form = divisionStatusForm(divisionRow(page, code));
  await clickAndWait(
    page,
    DIVISIONS_PATH,
    form.getByRole('button', { name: t.actions[action].submit }),
  );
}

test('adds a division (code stored upper-case) that students can choose; a duplicate code is refused', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  const student = await registerStudentWithProfile(page, { college: college.slug });
  await signInAdmin(page, college);

  // The dashboard shortcut and the navigation entry lead to the screen.
  await page
    .locator('main [data-shortcut="divisions"]')
    .getByRole('link', { name: ar.nav.admin.divisions })
    .click();
  await expect(page).toHaveURL(DIVISIONS_PATH);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
  await expect(
    page
      .getByRole('navigation', { name: ar.nav.label })
      .getByRole('link', { name: ar.nav.admin.divisions, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect(await rowCodes(page)).toEqual(['GEN']);
  // No delete control anywhere on the screen.
  await expect(page.getByRole('button', { name: ar.common.actions.delete })).toHaveCount(0);

  await addDivision(page, {
    code: ' se ',
    nameAr: 'هندسة البرمجيات',
    nameEn: 'Software Engineering',
    sortOrder: '5',
  });
  await expect(page.locator('main [data-slot="division-added"]')).toHaveText(t.form.added);
  const row = divisionRow(page, 'SE');
  await expect(row.locator('[data-field="code"] bdi')).toHaveAttribute('dir', 'ltr');
  await expect(row.locator('[data-field="nameAr"]')).toHaveText('هندسة البرمجيات');
  await expect(row.locator('[data-field="nameEn"]')).toHaveText('Software Engineering');
  await expect(row.locator('[data-field="status"]')).toHaveText(t.list.active);
  // The form is empty again for the next division.
  await expect(addDivisionForm(page).getByLabel(t.form.code, { exact: true })).toHaveValue('');

  const stored = await listDivisions(college.slug);
  const se = stored.find((division) => division.code === 'SE');
  expect(se).toMatchObject({ nameEn: 'Software Engineering', sortOrder: 5, isActive: true });
  expect(await listAuditEvents(college.slug, 'division.created')).toMatchObject([
    { actorUserId: await accountId(college.adminEmail), targetId: se?.id },
  ]);

  // Offered to the college's students at once.
  const studentPage = await studentBrowser(browser, { baseURL, extraHTTPHeaders }, student);
  const picker = await profileDivisionPicker(studentPage);
  await expect(picker.locator('option')).toHaveText([
    ar.onboarding.divisionPlaceholder,
    'عام',
    'هندسة البرمجيات',
  ]);
  await studentPage.context().close();

  // The same code again, in any case, is refused on the code field; the entered values stay.
  await addDivision(page, { code: 'Se', nameAr: 'نسخة', nameEn: 'Copy' });
  const codeField = addDivisionForm(page).getByLabel(t.form.code, { exact: true });
  await expect(codeField).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#division-code-error')).toHaveText(t.form.codeTaken);
  await expect(codeField).toHaveValue('Se');
  await expect(addDivisionForm(page).getByLabel(t.form.nameEn, { exact: true })).toHaveValue(
    'Copy',
  );
  expect(await listDivisions(college.slug)).toHaveLength(2);
  expect(await countAuditEvents(college.slug, 'division.created')).toBe(1);
});

test('editing names and order changes the list order and audits only the changed fields', async ({
  page,
}) => {
  const college = await newCollege();
  await signInAdmin(page, college);
  await page.goto(DIVISIONS_PATH);
  await addDivision(page, { code: 'AI', nameAr: 'الذكاء الاصطناعي', nameEn: 'AI', sortOrder: '3' });
  await addDivision(page, { code: 'SE', nameAr: 'البرمجيات', nameEn: 'SE', sortOrder: '5' });
  await expect(divisionRow(page, 'SE')).toHaveCount(1);
  expect(await rowCodes(page)).toEqual(['GEN', 'AI', 'SE']);

  const form = await openDialog(
    editDivisionTrigger(divisionRow(page, 'SE')),
    editDivisionDialog(page),
  );
  // Edit mode has no code field.
  await expect(form.getByLabel(t.form.code, { exact: true })).toHaveCount(0);
  await expect(form.getByLabel(t.form.nameAr, { exact: true })).toHaveValue('البرمجيات');
  await form.getByLabel(t.form.nameAr, { exact: true }).fill('هندسة البرمجيات');
  await form.getByLabel(t.form.sortOrder, { exact: true }).fill('1');
  await clickAndWait(page, DIVISIONS_PATH, form.getByRole('button', { name: t.form.save }));
  await expect(editDivisionDialog(page)).toBeHidden();
  await expect(divisionRow(page, 'SE').locator('[data-slot="division-edit-status"]')).toHaveText(
    t.actions.edit.done,
  );
  await expect(divisionRow(page, 'SE').locator('[data-field="nameAr"]')).toHaveText(
    'هندسة البرمجيات',
  );
  await expect.poll(() => rowCodes(page)).toEqual(['GEN', 'SE', 'AI']);

  const se = (await listDivisions(college.slug)).find((division) => division.code === 'SE');
  expect(se).toMatchObject({ code: 'SE', nameAr: 'هندسة البرمجيات', nameEn: 'SE', sortOrder: 1 });
  expect(await listAuditEvents(college.slug, 'division.updated')).toEqual([
    {
      actorUserId: await accountId(college.adminEmail),
      targetId: se?.id,
      metadata: { fields: ['nameAr', 'sortOrder'] },
    },
  ]);

  // An invalid order is refused inside the dialog, which stays open; nothing changes.
  const again = await openDialog(
    editDivisionTrigger(divisionRow(page, 'SE')),
    editDivisionDialog(page),
  );
  // Not a number (the field's maxlength of 4 keeps an out-of-range number from being typed at all).
  await again.getByLabel(t.form.sortOrder, { exact: true }).fill('1st');
  await clickAndWait(page, DIVISIONS_PATH, again.getByRole('button', { name: t.form.save }));
  await expect(again.getByLabel(t.form.sortOrder, { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(editDivisionDialog(page)).toBeHidden();
  expect(await countAuditEvents(college.slug, 'division.updated')).toBe(1);
});

test('a deactivated division is no longer offered, stays with the students who have it, and can be reactivated', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  await signInAdmin(page, college);
  await page.goto(DIVISIONS_PATH);
  // After GEN (order 0) in every list.
  await addDivision(page, {
    code: 'CS',
    nameAr: 'علوم الحاسب',
    nameEn: 'Computer Science',
    sortOrder: '1',
  });
  await expect(divisionRow(page, 'CS')).toHaveCount(1);

  // One student has CS, another has GEN (profiles made directly; registration through the screens).
  const options = { baseURL, extraHTTPHeaders };
  const studentPage = await (await browser.newContext(options)).newPage();
  const holder = await registerConfirmedStudent(studentPage, { college: college.slug });
  await createStudentProfile(holder, { studentCode: uniqueStudentCode(), divisionCode: 'CS' });
  const other = await registerConfirmedStudent(studentPage, { college: college.slug });
  await createStudentProfile(other, { studentCode: uniqueStudentCode(), divisionCode: 'GEN' });
  await studentPage.context().close();

  await setActive(page, 'CS', 'deactivate');
  const row = divisionRow(page, 'CS');
  await expect(row.locator('[data-field="status"]')).toHaveText(t.list.inactive);
  await expect(
    divisionStatusForm(row).getByRole('button', { name: t.actions.activate.submit }),
  ).toBeVisible();
  const cs = (await listDivisions(college.slug)).find((division) => division.code === 'CS');
  expect(cs?.isActive).toBe(false);
  expect(await listAuditEvents(college.slug, 'division.deactivated')).toEqual([
    { actorUserId: await accountId(college.adminEmail), targetId: cs?.id, metadata: {} },
  ]);

  // Not offered to another student.
  const otherPage = await studentBrowser(browser, options, other);
  await expect((await profileDivisionPicker(otherPage)).locator('option')).toHaveText([
    ar.onboarding.divisionPlaceholder,
    'عام',
  ]);

  // Still shown, and kept on saving, for the student who has it.
  const holderPage = await studentBrowser(browser, options, holder);
  const picker = await profileDivisionPicker(holderPage);
  const current = ar.profile.academic.divisionInactive.replace('{name}', 'علوم الحاسب');
  await expect(picker.locator('option:checked')).toHaveText(current);
  const academic = holderPage.locator('main [data-slot="academic"] form');
  await academic
    .getByLabel(ar.onboarding.level, { exact: true })
    .selectOption({ label: ar.common.levels['2'] });
  await academic.getByRole('button', { name: ar.profile.academic.submit }).click();
  await expect(academic.locator('[data-slot="saved-status"]')).toBeVisible();
  expect(await getStudentProfile(holder)).toMatchObject({ level: 2, divisionCode: 'CS' });
  await holderPage.context().close();

  // Reactivated: offered again.
  await setActive(page, 'CS', 'activate');
  await expect(row.locator('[data-field="status"]')).toHaveText(t.list.active);
  expect(await countAuditEvents(college.slug, 'division.activated')).toBe(1);
  await expect((await profileDivisionPicker(otherPage)).locator('option')).toHaveText([
    ar.onboarding.divisionPlaceholder,
    'عام',
    'علوم الحاسب',
  ]);
  await otherPage.context().close();
});

test('a forged id of another college’s division is refused with not_found and changes nothing', async ({
  page,
}) => {
  const college = await newCollege();
  const other = await createCollege(uniqueCollegeSlug('div-x'), uniqueEmail('div-x-admin'));
  const [foreign] = await listDivisions(other.slug);
  if (foreign === undefined) throw new Error('the other college has no division');
  const otherBefore = await listDivisions(other.slug);
  const ownBefore = await listDivisions(college.slug);
  await signInAdmin(page, college);
  await page.goto(DIVISIONS_PATH);

  // Edit: the hidden id replaced by the other college's.
  const form = await openDialog(
    editDivisionTrigger(divisionRow(page, 'GEN')),
    editDivisionDialog(page),
  );
  await form.getByLabel(t.form.nameEn, { exact: true }).fill('Hijacked');
  await setFormField(form, 'divisionId', foreign.id);
  await clickAndWait(page, DIVISIONS_PATH, form.getByRole('button', { name: t.form.save }));
  const editError = form.locator('[data-slot="form-error"]');
  await expect(editError).toHaveAttribute('data-code', 'not_found');
  await expect(editError).toContainText(ar.errors.not_found);
  await page.keyboard.press('Escape');
  await expect(editDivisionDialog(page)).toBeHidden();

  // Deactivate: the same.
  const status = divisionStatusForm(divisionRow(page, 'GEN'));
  await setFormField(status, 'divisionId', foreign.id);
  await clickAndWait(
    page,
    DIVISIONS_PATH,
    status.getByRole('button', { name: t.actions.deactivate.submit }),
  );
  const statusError = status.locator('[data-slot="form-error"]');
  await expect(statusError).toHaveAttribute('data-code', 'not_found');

  expect(await listDivisions(other.slug)).toEqual(otherBefore);
  expect(await listDivisions(college.slug)).toEqual(ownBefore);
  for (const action of ['division.updated', 'division.deactivated']) {
    expect(await countAuditEvents(college.slug, action)).toBe(0);
    expect(await countAuditEvents(other.slug, action)).toBe(0);
  }
});
