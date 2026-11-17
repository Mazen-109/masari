import type { Page } from '@playwright/test';
import {
  addDivision,
  countAuditEvents,
  createCollege,
  createStudentProfile,
  getStudentProfile,
  getUserByEmail,
} from './support/db';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  completeProfile,
  openUserMenu,
  registerConfirmedStudent,
  registerOnboardedStudent,
  signIn,
  uniqueStudentCode,
  userMenuTrigger,
  type TestLocale,
} from './support/flows';
import { setFormField } from './support/forge';

// The academic profile, part 1: the mandatory profile-completion step (US2 acceptance scenarios 1–3;
// contracts/routes.md §3, contracts/server-actions.md §5.1, contracts/permissions.md §3; FR-024–FR-026,
// FR-044). Part 2: the profile screen (US2 scenarios 5–6, student part; contracts/routes.md §4,
// contracts/server-actions.md §5.1 and §6; FR-025–FR-027).

const { ar, en } = CATALOGS;

/** Registers, confirms, and signs in a new student, who lands on the onboarding step. */
async function signInNewStudent(
  page: Page,
  input: { college?: string; locale?: TestLocale } = {},
): Promise<string> {
  const locale = input.locale ?? 'ar';
  const email = await registerConfirmedStudent(page, { college: input.college, locale });
  await signIn(page, { email, locale });
  await expect(page).toHaveURL(`/${locale}/onboarding`);
  return email;
}

function fieldError(page: Page, id: string) {
  return page.locator(`#${id}-error`);
}

test('a new student lands on onboarding, and every app screen sends them back to it', async ({
  page,
}) => {
  const college = await createCollege();
  await signInNewStudent(page, { college: college.slug });

  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.onboarding));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.onboarding.title);
  // Minimal shell: college name, language switch, sign out — no navigation.
  await expect(page.getByRole('banner')).toContainText(college.nameAr);
  await expect(
    page.getByRole('banner').getByRole('button', { name: ar.auth.signOut.submit }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);

  // Including a module the student may not open: the onboarding redirect comes before the 404.
  for (const path of ['/ar/dashboard', '/ar/modules/mueed', '/ar/modules/mizan']) {
    await page.goto(path);
    await expect(page).toHaveURL('/ar/onboarding');
  }
});

test("the level options are exactly the college's levels and the divisions its active ones", async ({
  page,
}) => {
  const college = await createCollege();
  await signInNewStudent(page, { college: college.slug });

  // A new college has 4 levels and the single division GEN (contracts/db-api.md §3).
  const levels = page.getByLabel(ar.onboarding.level, { exact: true }).locator('option');
  await expect(levels).toHaveText([
    ar.onboarding.levelPlaceholder,
    ar.common.levels['1'],
    ar.common.levels['2'],
    ar.common.levels['3'],
    ar.common.levels['4'],
  ]);
  const divisions = page.getByLabel(ar.onboarding.division, { exact: true }).locator('option');
  await expect(divisions).toHaveText([ar.onboarding.divisionPlaceholder, 'عام']);
  await expect(page.getByLabel(ar.onboarding.studentCode, { exact: true })).toHaveAttribute(
    'dir',
    'ltr',
  );

  await page.goto('/en/onboarding');
  await expect(
    page.getByLabel(en.onboarding.division, { exact: true }).locator('option'),
  ).toHaveText([en.onboarding.divisionPlaceholder, 'General']);
});

test('a valid profile goes to the dashboard, which shows code, level, and division', async ({
  page,
}) => {
  const college = await createCollege();
  await signInNewStudent(page, { college: college.slug });
  expect(await countAuditEvents(college.slug, 'profile.created')).toBe(0);

  const entered = await completeProfile(page, { level: ar.common.levels['3'] });

  await expect(page).toHaveURL('/ar/dashboard');
  const summary = page.locator('main [data-slot="student-summary"]');
  await expect(summary.locator('[data-field="studentCode"]')).toHaveText(entered.studentCode);
  await expect(summary.locator('[data-field="level"]')).toHaveText(ar.common.levels['3']);
  await expect(summary.locator('[data-field="division"]')).toHaveText('عام');
  expect(await countAuditEvents(college.slug, 'profile.created')).toBe(1);

  // Done once: the step now leads to the dashboard, and the app screens open normally.
  await page.goto('/ar/onboarding');
  await expect(page).toHaveURL('/ar/dashboard');
  await page.goto('/ar/modules/mueed');
  await expect(page).toHaveURL('/ar/modules/mueed');
});

test('a student code already used in the college is refused on the field', async ({ page }) => {
  const college = await createCollege();
  const studentCode = uniqueStudentCode();
  await registerOnboardedStudent(page, { college: college.slug, profile: { studentCode } });

  await signInNewStudent(page, { college: college.slug });
  await completeProfile(page, { studentCode });

  await expect(page.locator('main [data-slot="form-error"]')).toHaveAttribute(
    'data-code',
    'validation',
  );
  // US2 scenario 3: the code is in use, and whom to contact (onboarding's own text, not the shared one).
  await expect(fieldError(page, 'profile-student-code')).toHaveText(ar.onboarding.studentCodeTaken);
  await expect(fieldError(page, 'profile-student-code')).toContainText('إدارة الكلية');
  await expect(page.getByLabel(ar.onboarding.studentCode, { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  // The entered values are kept.
  await expect(page.getByLabel(ar.onboarding.studentCode, { exact: true })).toHaveValue(
    studentCode,
  );
  await expect(page).toHaveURL('/ar/onboarding');
  expect(await countAuditEvents(college.slug, 'profile.created')).toBe(1);
});

test('a student code in the wrong format is refused, and nothing is saved', async ({ page }) => {
  const college = await createCollege();
  await signInNewStudent(page, { college: college.slug });

  for (const studentCode of ['AB', 'CS 2024', 'كود123']) {
    await completeProfile(page, { studentCode });
    await expect(fieldError(page, 'profile-student-code')).toHaveText(ar.errors.invalid_format);
    await expect(page).toHaveURL('/ar/onboarding');
  }
  expect(await countAuditEvents(college.slug, 'profile.created')).toBe(0);

  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/onboarding');
});

test('a missing level and division are reported on their fields', async ({ page }) => {
  await signInNewStudent(page);
  await page.getByLabel(ar.onboarding.studentCode, { exact: true }).fill(uniqueStudentCode());
  await page.getByRole('button', { name: ar.onboarding.submit }).click();

  await expect(fieldError(page, 'profile-level')).toHaveText(ar.errors.required);
  await expect(fieldError(page, 'profile-division')).toHaveText(ar.errors.required);
  await expect(page).toHaveURL('/ar/onboarding');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the profile step works', async ({ page }) => {
    await signInNewStudent(page, { locale: 'en' });
    const entered = await completeProfile(page, { locale: 'en' });
    await expect(page).toHaveURL('/en/dashboard');
    await expect(page.locator('main [data-field="studentCode"]')).toHaveText(entered.studentCode);
  });
});

// ---------------------------------------------------------------------------------------------------
// Part 2: the profile screen.

/**
 * A confirmed student of the college (default `demo`) with an academic profile made directly in the
 * database (level 1; the college's first active division, or `divisionCode`), signed in on the dashboard.
 */
async function signInStudentWithProfile(
  page: Page,
  input: { college?: string; locale?: TestLocale; divisionCode?: string } = {},
): Promise<{ email: string; studentCode: string }> {
  const locale = input.locale ?? 'ar';
  const email = await registerConfirmedStudent(page, { college: input.college, locale });
  const studentCode = uniqueStudentCode();
  await createStudentProfile(email, { studentCode, divisionCode: input.divisionCode });
  await signIn(page, { email, locale });
  await expect(page).toHaveURL(`/${locale}/dashboard`);
  return { email, studentCode };
}

function accountForm(page: Page) {
  return page.locator('main [data-slot="account"] form');
}

function academicForm(page: Page) {
  return page.locator('main [data-slot="academic"] form');
}

test('the profile screen shows the account, the language, and the read-only student code', async ({
  page,
}) => {
  const { email, studentCode } = await signInStudentWithProfile(page);
  await page.goto('/ar/profile');

  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.profile));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.profile.title);
  await expect(accountForm(page).getByLabel(ar.profile.account.name, { exact: true })).toHaveValue(
    'Test Student',
  );
  const emailField = accountForm(page).getByLabel(ar.profile.account.email, { exact: true });
  await expect(emailField).toHaveValue(email);
  await expect(emailField).toHaveAttribute('readonly', '');
  await expect(emailField).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('main [data-slot="language"]')).toContainText(
    ar.profile.language.title,
  );

  // US2 scenario 5: the code is shown, but there is no control for it.
  await expect(academicForm(page).locator('[data-field="studentCode"]')).toHaveText(studentCode);
  await expect(academicForm(page).locator('[name="studentCode"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: ar.onboarding.studentCode })).toHaveCount(0);
  await expect(academicForm(page).getByLabel(ar.onboarding.level, { exact: true })).toHaveValue(
    '1',
  );

  // Reachable from the user menu.
  await page.goto('/ar/dashboard');
  await openUserMenu(page);
  await page.getByRole('menuitem', { name: ar.nav.profile }).click();
  await expect(page).toHaveURL('/ar/profile');
});

test('a changed name is saved and shown in the header and on the dashboard at once', async ({
  page,
}) => {
  const { email } = await signInStudentWithProfile(page);
  await page.goto('/ar/profile');
  const newName = 'منى علي';

  await accountForm(page).getByLabel(ar.profile.account.name, { exact: true }).fill(newName);
  await accountForm(page).getByRole('button', { name: ar.profile.account.submit }).click();

  await expect(accountForm(page).locator('[data-slot="saved-status"]')).toHaveText(
    ar.profile.saved,
  );
  await expect(userMenuTrigger(page)).toHaveAccessibleName(
    ar.nav.userMenu.replace('{name}', newName),
  );
  await expect(accountForm(page).getByLabel(ar.profile.account.name, { exact: true })).toHaveValue(
    newName,
  );
  expect((await getUserByEmail(email))?.name).toBe(newName);

  await page.goto('/ar/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(newName);
});

test('a name in the wrong format is refused on the field, and nothing is saved', async ({
  page,
}) => {
  const { email } = await signInStudentWithProfile(page);
  await page.goto('/ar/profile');

  await accountForm(page).getByLabel(ar.profile.account.name, { exact: true }).fill('M');
  await accountForm(page).getByRole('button', { name: ar.profile.account.submit }).click();

  await expect(page.locator('#account-name-error')).toHaveText(ar.errors.too_short);
  await expect(accountForm(page).getByLabel(ar.profile.account.name, { exact: true })).toHaveValue(
    'M',
  );
  await expect(accountForm(page).locator('[data-slot="saved-status"]')).toHaveCount(0);
  expect((await getUserByEmail(email))?.name).toBe('Test Student');
});

test('a changed level and division are saved, audited once, and shown on the dashboard', async ({
  page,
}) => {
  const college = await createCollege();
  await addDivision(college.tenantId, {
    code: 'CS',
    nameAr: 'علوم الحاسب',
    nameEn: 'Computer Science',
    sortOrder: 10,
  });
  const { email, studentCode } = await signInStudentWithProfile(page, { college: college.slug });
  await page.goto('/ar/profile');

  const level = academicForm(page).getByLabel(ar.onboarding.level, { exact: true });
  const division = academicForm(page).getByLabel(ar.onboarding.division, { exact: true });
  await level.selectOption({ label: ar.common.levels['3'] });
  await division.selectOption({ label: 'علوم الحاسب' });
  await academicForm(page).getByRole('button', { name: ar.profile.academic.submit }).click();

  await expect(academicForm(page).locator('[data-slot="saved-status"]')).toHaveText(
    ar.profile.saved,
  );
  await expect(level).toHaveValue('3');
  expect(await getStudentProfile(email)).toEqual({ studentCode, level: 3, divisionCode: 'CS' });
  expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(1);

  // Saving again without a change writes no second audit row.
  await academicForm(page).getByRole('button', { name: ar.profile.academic.submit }).click();
  await expect(academicForm(page).locator('[data-slot="saved-status"]')).toBeVisible();
  expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(1);

  await page.goto('/ar/dashboard');
  const summary = page.locator('main [data-slot="student-summary"]');
  await expect(summary.locator('[data-field="level"]')).toHaveText(ar.common.levels['3']);
  await expect(summary.locator('[data-field="division"]')).toHaveText('علوم الحاسب');
});

test("a level above the college's number of levels is refused, and nothing is saved", async ({
  page,
}) => {
  const college = await createCollege();
  const { email, studentCode } = await signInStudentWithProfile(page, { college: college.slug });
  await page.goto('/ar/profile');

  // The college has 4 levels; the option for level 5 exists only in the forged DOM.
  await setFormField(academicForm(page), 'level', '5');
  await academicForm(page).getByRole('button', { name: ar.profile.academic.submit }).click();

  await expect(page.locator('#profile-level-error')).toHaveText(ar.errors.out_of_range);
  expect(await getStudentProfile(email)).toEqual({ studentCode, level: 1, divisionCode: 'GEN' });
  expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(0);
});

test('the current division stays offered after the college deactivated it', async ({ page }) => {
  const college = await createCollege();
  await addDivision(college.tenantId, {
    code: 'OLD',
    nameAr: 'شعبة قديمة',
    nameEn: 'Old division',
    sortOrder: 5,
    isActive: false,
  });
  const { email } = await signInStudentWithProfile(page, {
    college: college.slug,
    divisionCode: 'OLD',
  });
  await page.goto('/ar/profile');

  const division = academicForm(page).getByLabel(ar.onboarding.division, { exact: true });
  const current = ar.profile.academic.divisionInactive.replace('{name}', 'شعبة قديمة');
  await expect(division.locator('option')).toHaveText([
    ar.onboarding.divisionPlaceholder,
    'عام',
    current,
  ]);
  await expect(division.locator('option:checked')).toHaveText(current);

  await academicForm(page)
    .getByLabel(ar.onboarding.level, { exact: true })
    .selectOption({ label: ar.common.levels['2'] });
  await academicForm(page).getByRole('button', { name: ar.profile.academic.submit }).click();
  await expect(academicForm(page).locator('[data-slot="saved-status"]')).toBeVisible();
  expect(await getStudentProfile(email)).toMatchObject({ level: 2, divisionCode: 'OLD' });
});

test('forged studentCode, role, and status fields never change the account or the code', async ({
  page,
}) => {
  const college = await createCollege();
  const { email, studentCode } = await signInStudentWithProfile(page, { college: college.slug });
  await page.goto('/ar/profile');

  for (const form of [academicForm(page), accountForm(page)]) {
    await setFormField(form, 'studentCode', 'FORGED-1');
    await setFormField(form, 'role', 'admin');
    await setFormField(form, 'status', 'suspended');
  }
  await academicForm(page)
    .getByLabel(ar.onboarding.level, { exact: true })
    .selectOption({ label: ar.common.levels['2'] });
  await academicForm(page).getByRole('button', { name: ar.profile.academic.submit }).click();
  await expect(academicForm(page).locator('[data-slot="saved-status"]')).toBeVisible();

  await accountForm(page).getByLabel(ar.profile.account.name, { exact: true }).fill('Omar Said');
  await accountForm(page).getByRole('button', { name: ar.profile.account.submit }).click();
  await expect(accountForm(page).locator('[data-slot="saved-status"]')).toBeVisible();

  expect(await getStudentProfile(email)).toEqual({ studentCode, level: 2, divisionCode: 'GEN' });
  expect(await getUserByEmail(email)).toMatchObject({
    name: 'Omar Said',
    role: 'student',
    status: 'active',
  });
  expect(await countAuditEvents(college.slug, 'profile.updated')).toBe(1);
  await expect(academicForm(page).locator('[data-field="studentCode"]')).toHaveText(studentCode);
});

test.describe('profile screen without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('it saves a new name and a new level', async ({ page }) => {
    const { email } = await signInStudentWithProfile(page, { locale: 'en' });
    await page.goto('/en/profile');

    await accountForm(page).getByLabel(en.profile.account.name, { exact: true }).fill('Omar Said');
    await accountForm(page).getByRole('button', { name: en.profile.account.submit }).click();
    await expect(accountForm(page).locator('[data-slot="saved-status"]')).toHaveText(
      en.profile.saved,
    );

    await academicForm(page)
      .getByLabel(en.onboarding.level, { exact: true })
      .selectOption({ label: en.common.levels['2'] });
    await academicForm(page).getByRole('button', { name: en.profile.academic.submit }).click();
    await expect(academicForm(page).locator('[data-slot="saved-status"]')).toHaveText(
      en.profile.saved,
    );

    expect((await getUserByEmail(email))?.name).toBe('Omar Said');
    expect((await getStudentProfile(email))?.level).toBe(2);
    await page.goto('/en/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Omar Said');
    await expect(page.locator('main [data-field="level"]')).toHaveText(en.common.levels['2']);
  });
});
