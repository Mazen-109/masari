import type { Page } from '@playwright/test';
import { countAuditEvents, countSessions, createCollege } from './support/db';
import { expectEmailCountStays, firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  registerConfirmedStudent,
  signIn,
  TEST_PASSWORD,
  uniqueEmail,
  type TestLocale,
} from './support/flows';

// Password recovery (US3 acceptance scenarios 1–3; contracts/server-actions.md §4.5–4.6,
// contracts/routes.md §2; FR-005, FR-007, FR-009, FR-010). The 1-hour expiry of the link cannot be waited
// for here: it is asserted on the auth configuration in src/server/auth/auth.test.ts.

const { ar, en } = CATALOGS;

/** Subject (English part) of the reset email (contracts/emails.md §3). */
const RESET_SUBJECT = 'Reset your Masari password';

const NEW_PASSWORD = 'Xy7'.repeat(4);

function statusOf(page: Page) {
  return page.locator('main [data-slot="form-status"]');
}

function formError(page: Page) {
  return page.locator('main [data-slot="form-error"]');
}

/** Opens "forgot your password?", submits `email`, and waits for the action's response. */
async function requestReset(page: Page, email: string, locale: TestLocale = 'ar'): Promise<void> {
  const t = CATALOGS[locale].auth.forgotPassword;
  await page.goto(`/${locale}/forgot-password`);
  await page.getByLabel(t.email, { exact: true }).fill(email);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: t.submit }).click(),
  ]);
}

/** The link of the newest reset email for `email` sent at or after `since`. */
async function resetLink(email: string, since: Date): Promise<string> {
  return firstLink(await waitForEmail({ to: email, subjectIncludes: RESET_SUBJECT, since }));
}

/** Fills and submits the new-password form already on screen. */
async function submitNewPassword(page: Page, password: string): Promise<void> {
  const t = ar.auth.resetPassword;
  await page.getByLabel(t.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: t.submit }).click();
}

async function expectInvalidLinkScreen(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    ar.auth.resetPassword.invalidTitle,
  );
  await expect(
    page.locator('main').getByRole('link', { name: ar.auth.resetPassword.requestNew }),
  ).toHaveAttribute('href', '/ar/forgot-password');
}

test('sign-in links to the forgot-password screen', async ({ page }) => {
  await page.goto('/ar/sign-in');
  await page.getByRole('link', { name: ar.auth.signIn.forgotPassword }).click();
  await expect(page).toHaveURL('/ar/forgot-password');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.forgotPassword.title);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.forgotPassword));
});

test('a known and an unknown email get the identical confirmation; only the account gets mail and an audit row', async ({
  page,
}) => {
  const college = await createCollege();
  const email = await registerConfirmedStudent(page, { college: college.slug });
  const unknown = uniqueEmail('nobody');
  const since = new Date();

  await requestReset(page, email);
  await expect(statusOf(page)).toHaveText(ar.auth.forgotPassword.sent);
  const forKnown = await page.locator('main').textContent();

  await requestReset(page, unknown);
  await expect(statusOf(page)).toHaveText(ar.auth.forgotPassword.sent);
  expect(await page.locator('main').textContent()).toBe(forKnown);

  await resetLink(email, since);
  await expect.poll(() => countAuditEvents(college.slug, 'auth.password_reset_requested')).toBe(1);
  await expectEmailCountStays(unknown, since, 0);
  // Still one row for the college: the unknown address recorded nothing.
  expect(await countAuditEvents(college.slug, 'auth.password_reset_requested')).toBe(1);
});

test('the link sets a new password, ends every session, and works only once', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await createCollege();
  const email = await registerConfirmedStudent(page, { college: college.slug });

  let link: string;
  // Another device signed in before the reset.
  const otherDevice = await browser.newContext({ baseURL, extraHTTPHeaders });
  try {
    const otherPage = await otherDevice.newPage();
    await signIn(otherPage, { email });
    await expect(otherPage).toHaveURL('/ar/onboarding');
    expect(await countSessions(email)).toBe(1);

    const since = new Date();
    await requestReset(page, email);
    link = await resetLink(email, since);

    await page.goto(link);
    await expect(page).toHaveURL(/\/ar\/reset-password\?token=[A-Za-z0-9]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.resetPassword.title);
    await submitNewPassword(page, NEW_PASSWORD);
    await expect(page).toHaveURL('/ar/sign-in?reset=1');
    await expect(page.locator('main [data-slot="sign-in-reset"]')).toHaveText(
      ar.auth.signIn.resetDone,
    );
    await expect.poll(() => countAuditEvents(college.slug, 'auth.password_reset')).toBe(1);
    expect(await countSessions(email)).toBe(0);

    // The other device is signed out on its next navigation.
    await otherPage.goto('/ar/onboarding');
    await expect(otherPage).toHaveURL(/\/ar\/sign-in(\?|$)/);
  } finally {
    await otherDevice.close();
  }

  // Old password refused, new one accepted.
  await signIn(page, { email, password: TEST_PASSWORD });
  await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
  await signIn(page, { email, password: NEW_PASSWORD });
  await expect(page).toHaveURL('/ar/onboarding');

  // The same link a second time: the invalid-link screen, and the password stays.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/ar\/reset-password\?error=/);
  await expectInvalidLinkScreen(page);
  expect(await countAuditEvents(college.slug, 'auth.password_reset')).toBe(1);
});

test('an altered link shows the invalid screen; a forged token in the form is refused', async ({
  page,
}) => {
  const email = await registerConfirmedStudent(page);
  const since = new Date();
  await requestReset(page, email);
  const link = new URL(await resetLink(email, since));

  // One character of the token changed.
  const segments = link.pathname.split('/');
  const token = segments.at(-1) ?? '';
  const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  link.pathname = [...segments.slice(0, -1), altered].join('/');
  await page.goto(link.toString());
  await expect(page).toHaveURL(/\/ar\/reset-password\?error=/);
  await expectInvalidLinkScreen(page);

  // A token that never came from a link: the form shows, the action refuses it and offers a new link.
  await page.goto(`/ar/reset-password?token=${altered}`);
  await submitNewPassword(page, NEW_PASSWORD);
  await expect(formError(page)).toHaveAttribute('data-code', 'token_invalid');
  await expect(formError(page)).toContainText(ar.errors.token_invalid);
  await page.locator('main').getByRole('link', { name: ar.auth.resetPassword.requestNew }).click();
  await expect(page).toHaveURL('/ar/forgot-password');

  // The account still uses its old password.
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/onboarding');
});

test('the reset screen without a token offers to request a new link', async ({ page }) => {
  await page.goto('/ar/reset-password');
  await expectInvalidLinkScreen(page);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.resetPassword));
});

test('a too-short new password is refused on the field', async ({ page }) => {
  await page.goto(`/en/reset-password?token=${'Tk9'.repeat(8)}`);
  await page.getByLabel(en.auth.resetPassword.password, { exact: true }).fill('short');
  await page.getByRole('button', { name: en.auth.resetPassword.submit }).click();
  const field = page.getByLabel(en.auth.resetPassword.password, { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('main')).toContainText(en.errors.password_too_short);
});

test('an invalid email is refused on the field and keeps what was typed', async ({ page }) => {
  await requestReset(page, 'not-an-email', 'en');
  const field = page.getByLabel(en.auth.forgotPassword.email, { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveValue('not-an-email');
  await expect(statusOf(page)).toBeEmpty();
});

test('the fourth reset request for one email within an hour is refused with a retry time', async ({
  page,
}) => {
  const email = uniqueEmail('limited');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await requestReset(page, email, 'en');
    await expect(statusOf(page)).toHaveText(en.auth.forgotPassword.sent);
  }

  await requestReset(page, email, 'en');

  await expect(formError(page)).toHaveAttribute('data-code', 'rate_limited');
  await expect(formError(page)).toContainText(en.errors.rate_limited);
  await expect(statusOf(page)).toBeEmpty();
});
