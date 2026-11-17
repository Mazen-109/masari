import type { Locator, Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { countAuditEvents, createCollege, getUserByEmail } from './support/db';
import { expectEmailCountStays, firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  fillRegistration,
  registerStudent,
  uniqueEmail,
  VERIFY_SUBJECT,
  type TestLocale,
} from './support/flows';

// Student registration (US1 acceptance scenarios 1 and 7; contracts/server-actions.md §4.1, FR-001…FR-005,
// FR-011, FR-013). Tests that count audit rows register in a college of their own.

const { ar, en } = CATALOGS;
const EXISTS_SUBJECT = 'You already have a Masari account';

type FieldErrorKey = keyof typeof ar.errors;

/** The control is marked invalid and described (first) by an element showing the translated error. */
async function expectFieldError(
  page: Page,
  control: Locator,
  code: FieldErrorKey,
  locale: TestLocale = 'ar',
) {
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await control.getAttribute('aria-describedby')) ?? '';
  const errorId = describedBy.split(' ')[0] ?? '';
  expect(errorId).not.toBe('');
  await expect(page.locator(`[id="${errorId}"]`)).toHaveText(CATALOGS[locale].errors[code]);
}

async function expectNoFieldError(control: Locator) {
  await expect(control).not.toHaveAttribute('aria-invalid', 'true');
}

function controls(page: Page, locale: TestLocale = 'ar') {
  const t = CATALOGS[locale].auth.register;
  return {
    college: page.getByLabel(t.college, { exact: true }),
    name: page.getByLabel(t.name, { exact: true }),
    email: page.getByLabel(t.email, { exact: true }),
    password: page.getByLabel(t.password, { exact: true }),
    consent: page.getByRole('checkbox'),
    submit: page.getByRole('button', { name: t.submit }),
  };
}

test('a new student registers, sees "check your email", and gets one confirmation email', async ({
  page,
}) => {
  const college = await createCollege();
  const email = uniqueEmail();
  const since = new Date();

  await registerStudent(page, { email, college: college.slug, name: 'Mona Ali' });

  await expect(page).toHaveURL('/ar/verify-email');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.verifyEmail.title);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.verifyEmail));
  const message = await waitForEmail({ to: email, subjectIncludes: VERIFY_SUBJECT, since });
  expect(message.template).toBe('verify-email');
  expect(firstLink(message)).toContain('/api/auth/verify-email?token=');
  expect(firstLink(message)).toContain(`callbackURL=${encodeURIComponent('/ar/email-verified')}`);
  await expectEmailCountStays(email, since, 1);

  const user = await getUserByEmail(email);
  expect(user).toMatchObject({
    tenantId: college.tenantId,
    name: 'Mona Ali',
    role: 'student',
    status: 'active',
    emailVerified: false,
    locale: 'ar',
  });
  expect(user?.privacyConsentAt).toBeInstanceOf(Date);
  expect(await countAuditEvents(college.slug, 'user.registered')).toBe(1);
});

test('forged role, status, and verification fields are ignored; the page locale is stored', async ({
  page,
}) => {
  const college = await createCollege();
  const email = uniqueEmail();

  await registerStudent(page, {
    email,
    locale: 'en',
    college: college.slug,
    extraFields: { role: 'admin', status: 'suspended', emailVerified: 'true', locale: 'ar' },
  });

  await expect(page).toHaveURL('/en/verify-email');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.verifyEmail.title);
  expect(await getUserByEmail(email)).toMatchObject({
    tenantId: college.tenantId,
    role: 'student',
    status: 'active',
    emailVerified: false,
    locale: 'en',
  });
});

test('registering an existing email shows the same screen and only notifies the owner', async ({
  page,
}) => {
  const college = await createCollege();
  const email = uniqueEmail();
  await registerStudent(page, { email, college: college.slug });
  await expect(page).toHaveURL('/ar/verify-email');
  const original = await getUserByEmail(email);
  expect(original).not.toBeNull();

  const since = new Date();
  await registerStudent(page, { email, college: 'demo', name: 'Someone Else' });

  await expect(page).toHaveURL('/ar/verify-email');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.verifyEmail.title);
  const notice = await waitForEmail({ to: email, subjectIncludes: EXISTS_SUBJECT, since });
  expect(notice.template).toBe('account-exists');
  await expectEmailCountStays(email, since, 1);
  expect(await getUserByEmail(email)).toEqual(original);
  expect(await countAuditEvents(college.slug, 'user.registered')).toBe(1);
});

test('the college is fixed by ?u= and shown in the page language', async ({ page }) => {
  const college = await createCollege();

  await page.goto(`/ar/register?u=${college.slug}`);
  const arabic = controls(page, 'ar').college;
  await expect(arabic).toHaveValue(college.nameAr);
  await expect(arabic).toHaveAttribute('readonly', '');

  await page.goto(`/en/register?u=${college.slug}`);
  await expect(controls(page, 'en').college).toHaveValue(college.nameEn);
});

test('the privacy link of the consent opens in a new tab and says so', async ({ page }) => {
  await page.goto('/en/register?u=demo');
  const linkText = /<link>(.*)<\/link>/.exec(en.auth.register.consent)?.[1] ?? '';
  expect(linkText).not.toBe('');
  const link = page
    .locator('main')
    .getByRole('link', { name: `${linkText}${en.common.opensInNewTab}`, exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  await expect(link).toHaveAttribute('href', '/en/privacy');
});

test('an unknown ?u= shows the picker; each invalid field shows its error on the field', async ({
  page,
}) => {
  // With a single active college it would be fixed whatever ?u= says (FR-002); make sure there are two.
  await createCollege();
  await page.goto('/ar/register?u=no-such-college');
  const form = controls(page);
  await expect(form.college).toHaveJSProperty('tagName', 'SELECT');
  await expect(form.college.locator('option[value="demo"]')).toHaveCount(1);

  await form.submit.click();
  await expect(page.locator('[data-slot="form-error"]')).toHaveText(ar.errors.validation);
  await expectFieldError(page, form.college, 'required');
  await expectFieldError(page, form.name, 'required');
  await expectFieldError(page, form.email, 'required');
  await expectFieldError(page, form.password, 'required');
  await expectFieldError(page, form.consent, 'consent_required');
  await expect(page).toHaveURL('/ar/register?u=no-such-college');
  await expectNoA11yViolations(page);

  await form.college.selectOption('demo');
  await form.name.fill('M');
  await form.email.fill('not-an-email');
  await form.password.fill('short');
  await form.consent.check();
  await form.submit.click();
  await expectFieldError(page, form.name, 'too_short');
  await expectFieldError(page, form.email, 'invalid_email');
  await expectFieldError(page, form.password, 'password_too_short');
  await expectNoFieldError(form.college);
  await expectNoFieldError(form.consent);
  // What was typed is kept, except the password.
  await expect(form.college).toHaveValue('demo');
  await expect(form.name).toHaveValue('M');
  await expect(form.email).toHaveValue('not-an-email');
  await expect(form.password).toHaveValue('');
  await expect(form.consent).toBeChecked();

  await form.name.fill('م'.repeat(101));
  await form.email.fill(uniqueEmail());
  await form.password.fill('x'.repeat(129));
  await form.submit.click();
  await expectFieldError(page, form.name, 'too_long');
  await expectFieldError(page, form.password, 'password_too_long');
  await expectNoFieldError(form.email);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the form still shows field errors', async ({ page }) => {
    await page.goto('/en/register?u=demo');
    const form = controls(page, 'en');
    await form.name.fill('M');
    await form.email.fill('not-an-email');
    await form.password.fill('short');
    await form.submit.click();

    await expect(page.locator('[data-slot="form-error"]')).toHaveText(en.errors.validation);
    await expectFieldError(page, form.name, 'too_short', 'en');
    await expectFieldError(page, form.email, 'invalid_email', 'en');
    await expectFieldError(page, form.password, 'password_too_short', 'en');
    await expectFieldError(page, form.consent, 'consent_required', 'en');
    // The page is rendered from the action result: what was typed is back, except the password.
    await expect(form.name).toHaveValue('M');
    await expect(form.email).toHaveValue('not-an-email');
    await expect(form.password).toHaveValue('');
    await expect(form.consent).not.toBeChecked();
  });

  test('a new and an existing email get exactly the same redirect', async ({ page }) => {
    const email = uniqueEmail();
    const redirects: { status: number; location: string | undefined }[] = [];
    for (const name of ['First Attempt', 'Second Attempt']) {
      await page.goto('/ar/register?u=demo');
      await fillRegistration(page, { email, name });
      const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.request().method() === 'POST'),
        controls(page).submit.click(),
      ]);
      redirects.push({ status: response.status(), location: response.headers().location });
      await expect(page).toHaveURL('/ar/verify-email');
    }

    expect(redirects[1]).toEqual(redirects[0]);
    expect(redirects[0]?.status).toBeGreaterThanOrEqual(300);
    expect(redirects[0]?.status).toBeLessThan(400);
    expect(redirects[0]?.location).toMatch(/\/ar\/verify-email$/);
  });
});

test('the registration form fits a phone screen and works there @mobile', async ({ page }) => {
  const email = uniqueEmail();
  await page.goto('/ar/register?u=demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.register.title);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const button = await controls(page).submit.boundingBox();
  expect(button).not.toBeNull();
  expect((button?.x ?? -1) >= 0 && (button?.x ?? 0) + (button?.width ?? 0) <= viewportWidth).toBe(
    true,
  );

  await registerStudent(page, { email });
  await expect(page).toHaveURL('/ar/verify-email');
});
