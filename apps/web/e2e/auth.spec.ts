import type { Page } from '@playwright/test';
import {
  countAuditEvents,
  countSessions,
  createCollege,
  getUserByEmail,
  setCollegeStatus,
} from './support/db';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  openUserMenu,
  registerConfirmedStudent,
  registerOnboardedStudent,
  registerStudent,
  signIn,
  signOut,
  TEST_PASSWORD,
  uniqueEmail,
} from './support/flows';

// Sign-in, sign-out, and the first dashboard (US1 acceptance scenarios 3, 5, 6, 9, 10;
// contracts/server-actions.md §4.3–4.4, contracts/routes.md §1–2, §4; FR-006, FR-008, FR-009, FR-044).

const { ar, en } = CATALOGS;

function formError(page: Page) {
  return page.locator('main [data-slot="form-error"]');
}

function dashboardHeading(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

/** The auth library's session cookie of the browser context, if any. */
async function sessionCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name.includes('session_token'));
}

test('a confirmed student signs in and lands on the Arabic dashboard with their name and college', async ({
  page,
}) => {
  const college = await createCollege();
  const email = await registerOnboardedStudent(page, { college: college.slug, name: 'Mona Ali' });

  await signIn(page, { email });

  await expect(page).toHaveURL('/ar/dashboard');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.dashboard));
  await expect(dashboardHeading(page)).toContainText('Mona Ali');
  await expect(page.getByRole('banner')).toContainText(college.nameAr);
  await expect(page.locator('main')).toContainText(college.nameAr);

  const cookie = await sessionCookie(page);
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
});

test('signing in from the English screen still lands in the account language', async ({ page }) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email, locale: 'en' });
  await expect(page).toHaveURL('/ar/dashboard');
});

test('the language chosen on the dashboard is remembered with the account, on any device', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');
  // A working user menu shows the page is hydrated, so the switch below runs its click handler.
  await openUserMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  const cookiesBefore = (await page.context().cookies()).map((cookie) => cookie.name).sort();

  await page.getByRole('banner').getByRole('link', { name: ar.common.switchLanguage }).click();

  await expect(page).toHaveURL('/en/dashboard');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(async () => (await getUserByEmail(email))?.locale).toBe('en');
  // The account is the only place the choice is kept: no language cookie appears.
  expect((await page.context().cookies()).map((cookie) => cookie.name).sort()).toEqual(
    cookiesBefore,
  );

  await signOut(page, 'en');
  await signIn(page, { email, locale: 'ar' });
  await expect(page).toHaveURL('/en/dashboard');

  // Another device: a fresh browser context with no cookies at all.
  const otherDevice = await browser.newContext({ baseURL, extraHTTPHeaders });
  try {
    const otherPage = await otherDevice.newPage();
    await signIn(otherPage, { email, locale: 'ar' });
    await expect(otherPage).toHaveURL('/en/dashboard');
    await expect(otherPage.locator('html')).toHaveAttribute('dir', 'ltr');
  } finally {
    await otherDevice.close();
  }

  // Switching back is remembered too. The page was just signed into again, so wait for hydration first
  // (a working user menu), or the click could land before the switch's handler is attached.
  await openUserMenu(page, 'en');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await page.getByRole('banner').getByRole('link', { name: en.common.switchLanguage }).click();
  await expect(page).toHaveURL('/ar/dashboard');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect.poll(async () => (await getUserByEmail(email))?.locale).toBe('ar');
});

test('a wrong password and an unknown email show the identical generic message', async ({
  page,
}) => {
  const email = await registerConfirmedStudent(page);

  await signIn(page, { email, password: `${TEST_PASSWORD}x` });
  await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
  const forWrongPassword = await formError(page).textContent();

  await signIn(page, { email: uniqueEmail('nobody') });
  await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
  expect(await formError(page).textContent()).toBe(forWrongPassword);
  expect(forWrongPassword).toBe(ar.errors.invalid_credentials);

  await expect(page).toHaveURL('/ar/sign-in');
  expect(await sessionCookie(page)).toBeUndefined();
});

test('an unconfirmed account with the correct password is told to confirm and can ask for a new email', async ({
  page,
}) => {
  const email = uniqueEmail();
  await registerStudent(page, { email, locale: 'en' });
  await page.waitForURL('/en/verify-email');

  await signIn(page, { email, locale: 'en' });

  await expect(formError(page)).toHaveAttribute('data-code', 'email_not_verified');
  await expect(formError(page)).toContainText(en.errors.email_not_verified);
  const resend = page.locator('main form', {
    has: page.getByRole('heading', { name: en.auth.resend.titleMissing }),
  });
  await expect(resend.getByLabel(en.auth.resend.email, { exact: true })).toHaveValue(email);
  await resend.getByRole('button', { name: en.auth.resend.submit }).click();
  await expect(resend.locator('[data-slot="form-status"]')).toHaveText(en.auth.resend.sent);
  expect(await sessionCookie(page)).toBeUndefined();
});

test('a signed-out visit to the dashboard goes to sign-in with next, and back after signing in', async ({
  page,
}) => {
  const email = await registerOnboardedStudent(page);

  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/sign-in?next=%2Fdashboard');
  await expect(page.locator('main input[type="hidden"][name="next"]')).toHaveValue('/dashboard');

  await signIn(page, { email, open: false });
  await expect(page).toHaveURL('/ar/dashboard');
});

test('a safe next is honoured after sign-in', async ({ page }) => {
  const email = await registerConfirmedStudent(page);
  await signIn(page, { email, query: `next=${encodeURIComponent('/privacy?from=next')}` });
  await expect(page).toHaveURL('/ar/privacy?from=next');
});

test('next=//evil.test is ignored', async ({ page }) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email, query: 'next=%2F%2Fevil.test' });
  await expect(page.locator('main input[name="next"]')).toHaveCount(0);
  await expect(page).toHaveURL('/ar/dashboard');
});

test('signed-in users opening /, /sign-in, or /register go to the dashboard', async ({ page }) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');

  for (const path of ['/ar', '/ar/sign-in', '/ar/register', '/en/sign-in', '/en/register']) {
    await page.goto(path);
    await expect(page).toHaveURL(path.startsWith('/en') ? '/en/dashboard' : '/ar/dashboard');
  }
});

test('the signed-in shell starts with the skip link', async ({ page }) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');

  await page.keyboard.press('Tab');
  const skipLink = page.locator('a[href="#main"]');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('after sign-out the dashboard is gone, also through the back button', async ({ page }) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');

  await signOut(page);
  expect(await sessionCookie(page)).toBeUndefined();

  await page.goBack();
  await expect(page).toHaveURL(/\/ar\/sign-in/);
  await expect(
    page.getByRole('banner').getByRole('button', { name: ar.auth.signOut.submit }),
  ).toHaveCount(0);

  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/sign-in?next=%2Fdashboard');
});

test('a session cookie saved before sign-out no longer works (the session row is gone)', async ({
  page,
}) => {
  const email = await registerOnboardedStudent(page);
  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');
  const saved = await sessionCookie(page);
  expect(saved).toBeDefined();
  expect(await countSessions(email)).toBe(1);

  await signOut(page);
  expect(await countSessions(email)).toBe(0);

  if (saved !== undefined) await page.context().addCookies([saved]);
  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/sign-in?next=%2Fdashboard');
});

test('a refused sign-in to a suspended college leaves no session and no audit row', async ({
  page,
}) => {
  const college = await createCollege();
  const email = await registerConfirmedStudent(page, { college: college.slug });
  await setCollegeStatus(college.slug, 'suspended');

  await signIn(page, { email });

  await expect(formError(page)).toHaveAttribute('data-code', 'tenant_suspended');
  await expect(formError(page)).toContainText(ar.errors.tenant_suspended);
  expect(await sessionCookie(page)).toBeUndefined();
  expect(await countSessions(email)).toBe(0);
  expect(await countAuditEvents(college.slug, 'auth.sign_in')).toBe(0);
  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/sign-in?next=%2Fdashboard');
});

test('next=/en/dashboard is not doubled into /ar/en/dashboard', async ({ page }) => {
  const email = await registerConfirmedStudent(page);
  await signIn(page, { email, query: `next=${encodeURIComponent('/en/privacy')}` });
  await expect(page).toHaveURL('/ar/privacy');
});

test('the 11th sign-in attempt for one email within 10 minutes is refused', async ({ page }) => {
  const email = uniqueEmail('limited');
  await page.goto('/en/sign-in');
  for (let attempt = 1; attempt <= 10; attempt++) {
    await signIn(page, { email, locale: 'en', open: false });
    await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
  }

  await signIn(page, { email, locale: 'en', open: false });

  await expect(formError(page)).toHaveAttribute('data-code', 'rate_limited');
  await expect(formError(page)).toContainText(en.errors.rate_limited);
  await expect(formError(page)).toContainText(/You can try again in \d+ minutes?\./);

  // The same refusal again is a fresh alert (removed while the request was pending).
  await signIn(page, { email, locale: 'en', open: false });
  await expect(formError(page)).toHaveAttribute('data-code', 'rate_limited');
});

test('every sign-in writes exactly one auth.sign_in audit row', async ({ page }) => {
  const college = await createCollege();
  // Onboarding the student signed in and out once already: count from there.
  const email = await registerOnboardedStudent(page, { college: college.slug });
  const signInsBefore = await countAuditEvents(college.slug, 'auth.sign_in');
  const signOutsBefore = await countAuditEvents(college.slug, 'auth.sign_out');
  expect(signInsBefore).toBe(1);

  await signIn(page, { email });
  await expect(page).toHaveURL('/ar/dashboard');
  expect(await countAuditEvents(college.slug, 'auth.sign_in')).toBe(signInsBefore + 1);

  await signOut(page);
  expect(await countAuditEvents(college.slug, 'auth.sign_out')).toBe(signOutsBefore + 1);

  await signIn(page, { email, password: `${TEST_PASSWORD}x` });
  await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
  await signIn(page, { email, open: false });
  await expect(page).toHaveURL('/ar/dashboard');
  expect(await countAuditEvents(college.slug, 'auth.sign_in')).toBe(signInsBefore + 2);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('signing in, a refusal, and signing out all work', async ({ page }) => {
    const email = await registerOnboardedStudent(page);

    await signIn(page, { email, password: `${TEST_PASSWORD}x` });
    await expect(formError(page)).toHaveAttribute('data-code', 'invalid_credentials');
    await expect(page.getByLabel(ar.auth.signIn.email, { exact: true })).toHaveValue(email);

    await signIn(page, { email, query: 'next=%2Fprivacy' });
    await expect(page).toHaveURL('/ar/privacy');

    await page.goto('/ar/dashboard');
    await signOut(page);
    expect(await sessionCookie(page)).toBeUndefined();
  });
});
