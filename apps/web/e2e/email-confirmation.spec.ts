import type { Page } from '@playwright/test';
import { getUserByEmail } from './support/db';
import { expectEmailCountStays, firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  confirmationLink,
  confirmEmail,
  registerStudent,
  uniqueEmail,
  VERIFY_SUBJECT,
  type TestLocale,
} from './support/flows';

// Email confirmation and "send it again" (US1 acceptance scenario 2; contracts/server-actions.md §4.2,
// contracts/routes.md §2; FR-004, FR-005, FR-009).

const { ar, en } = CATALOGS;

/** Registers a new student (college fixed by ?u=demo) and waits for the "check your email" screen. */
async function registerNew(page: Page, email: string, locale: TestLocale = 'ar'): Promise<void> {
  await registerStudent(page, { email, locale });
  await expect(page).toHaveURL(`/${locale}/verify-email`);
}

/** Submits the resend form on the current screen and waits for the action's response. */
async function requestResend(page: Page, email: string, locale: TestLocale = 'ar'): Promise<void> {
  const t = CATALOGS[locale].auth.resend;
  await page.getByLabel(t.email, { exact: true }).fill(email);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: t.submit }).click(),
  ]);
}

function statusOf(page: Page) {
  return page.locator('main [data-slot="form-status"]');
}

/** No session cookie of the auth library is set in the browser. */
async function expectSignedOut(page: Page): Promise<void> {
  const names = (await page.context().cookies()).map((cookie) => cookie.name);
  expect(names.filter((name) => name.includes('session'))).toEqual([]);
}

test('the link confirms the account without signing in, and works again when reopened', async ({
  page,
}) => {
  const email = uniqueEmail();
  await registerNew(page, email);

  const link = await confirmEmail(page, email);

  await expect(page).toHaveURL('/ar/email-verified');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    ar.auth.emailVerified.successTitle,
  );
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.emailVerified));
  await expect(
    page.locator('main').getByRole('link', { name: ar.auth.emailVerified.signIn }),
  ).toHaveAttribute('href', '/ar/sign-in');
  expect(await getUserByEmail(email)).toMatchObject({ emailVerified: true });
  await expectSignedOut(page);

  await page.goto(link);
  await expect(page).toHaveURL('/ar/email-verified');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    ar.auth.emailVerified.successTitle,
  );
  await expectSignedOut(page);
});

test('a tampered link shows the invalid screen with a resend form that sends a new link', async ({
  page,
}) => {
  const email = uniqueEmail();
  await registerNew(page, email);
  const url = new URL(await confirmationLink(email));
  const token = url.searchParams.get('token') ?? '';
  expect(token.length).toBeGreaterThan(8);
  const ending = token.endsWith('AAAA') ? 'BBBB' : 'AAAA';
  url.searchParams.set('token', `${token.slice(0, -4)}${ending}`);

  await page.goto(url.toString());

  await expect(page).toHaveURL(/\/ar\/email-verified\?error=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    ar.auth.emailVerified.errorTitle,
  );
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText(
    ar.auth.resend.titleInvalid,
  );
  expect(await getUserByEmail(email)).toMatchObject({ emailVerified: false });
  await expectSignedOut(page);

  const since = new Date();
  await requestResend(page, email);
  await expect(statusOf(page)).toHaveText(ar.auth.resend.sent);
  await waitForEmail({ to: email, subjectIncludes: VERIFY_SUBJECT, since });
  await confirmEmail(page, email);
  await expect(page).toHaveURL('/ar/email-verified');
  expect(await getUserByEmail(email)).toMatchObject({ emailVerified: true });
});

test('resend answers the same for an unconfirmed account and an unknown email; only the account gets a message', async ({
  page,
}) => {
  const email = uniqueEmail();
  await registerNew(page, email, 'en');
  await waitForEmail({ to: email, subjectIncludes: VERIFY_SUBJECT, since: new Date(0) });

  const since = new Date();
  await requestResend(page, email, 'en');
  await expect(statusOf(page)).toHaveText(en.auth.resend.sent);
  const answerForAccount = await statusOf(page).textContent();
  const message = await waitForEmail({ to: email, subjectIncludes: VERIFY_SUBJECT, since });
  expect(message.template).toBe('verify-email');
  expect(firstLink(message)).toContain(`callbackURL=${encodeURIComponent('/en/email-verified')}`);
  await expectEmailCountStays(email, since, 1);

  const unknown = uniqueEmail('nobody');
  await page.goto('/en/verify-email');
  await requestResend(page, unknown, 'en');
  await expect(statusOf(page)).toHaveText(en.auth.resend.sent);
  expect(await statusOf(page).textContent()).toBe(answerForAccount);
  await expect(page.locator('[data-slot="form-error"]')).toHaveCount(0);
  await expectEmailCountStays(unknown, since, 0);
});

test('a confirmed account gets no new message from resend', async ({ page }) => {
  const email = uniqueEmail();
  await registerNew(page, email);
  await confirmEmail(page, email);

  const since = new Date();
  await page.goto('/ar/verify-email');
  await requestResend(page, email);
  await expect(statusOf(page)).toHaveText(ar.auth.resend.sent);
  await expectEmailCountStays(email, since, 0);
});

test('the fourth resend for one email within an hour is refused with a retry time', async ({
  page,
}) => {
  const email = uniqueEmail('limited');
  await page.goto('/en/verify-email');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await requestResend(page, email, 'en');
    await expect(statusOf(page)).toHaveText(en.auth.resend.sent);
  }

  await requestResend(page, email, 'en');

  const alert = page.locator('main [data-slot="form-error"]');
  await expect(alert).toHaveAttribute('data-code', 'rate_limited');
  await expect(alert).toContainText(en.errors.rate_limited);
  await expect(alert).toContainText(/You can try again in \d+ minutes?\./);
  await expect(statusOf(page)).toBeEmpty();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the resend form works and shows its errors', async ({ page }) => {
    await page.goto('/ar/verify-email');
    await requestResend(page, 'not-an-email');
    const field = page.getByLabel(ar.auth.resend.email, { exact: true });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveValue('not-an-email');
    await expect(page.locator('[id="resend-email-error"]')).toHaveText(ar.errors.invalid_email);

    await requestResend(page, uniqueEmail('nobody'));
    await expect(statusOf(page)).toHaveText(ar.auth.resend.sent);
  });
});
