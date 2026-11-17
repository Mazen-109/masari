import type { Page } from '@playwright/test';
import { countAuditEvents, createCollege } from './support/db';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  completeProfile,
  registerConfirmedStudent,
  registerOnboardedStudent,
  signIn,
  uniqueStudentCode,
  type TestLocale,
} from './support/flows';

// The academic profile, part 1: the mandatory profile-completion step (US2 acceptance scenarios 1–3;
// contracts/routes.md §3, contracts/server-actions.md §5.1, contracts/permissions.md §3; FR-024–FR-026,
// FR-044). Part 2 (the profile screen) comes with PR-23.

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
