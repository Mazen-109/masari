import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import ar from '../../messages/ar.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import { firstLink, waitForEmail } from './emails';

// User journeys shared by the e2e specs. Every helper drives the real screens (or opens the links of the
// captured emails); none of them writes to the database directly.

export const CATALOGS = { ar, en } as const;
export type TestLocale = keyof typeof CATALOGS;

/** A password every rule accepts (12 characters). */
export const TEST_PASSWORD = 'Ab1'.repeat(4);

/** An address no other test uses. */
export function uniqueEmail(prefix = 'student'): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export type RegistrationInput = {
  email: string;
  locale?: TestLocale;
  /** Slug passed as `?u=`; default `demo`. */
  college?: string;
  name?: string;
  password?: string;
  consent?: boolean;
  /** Extra hidden fields appended to the form before submitting (forged input). */
  extraFields?: Record<string, string>;
};

/**
 * Opens `/{locale}/register?u=<college>`, fills the form, and submits it. Does not wait for the result:
 * callers assert the URL or the errors.
 */
export async function registerStudent(page: Page, input: RegistrationInput): Promise<void> {
  const locale = input.locale ?? 'ar';
  const t = CATALOGS[locale].auth.register;
  await page.goto(`/${locale}/register?u=${input.college ?? 'demo'}`);
  await fillRegistration(page, input);
  const form = page.locator('main form');
  if (input.extraFields !== undefined) {
    await form.evaluate((element, extra) => {
      for (const [name, value] of Object.entries(extra)) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = value;
        element.append(hidden);
      }
    }, input.extraFields);
  }
  await page.getByRole('button', { name: t.submit }).click();
}

/** Fills the registration form already on screen (the college must be fixed or already chosen). */
export async function fillRegistration(page: Page, input: RegistrationInput): Promise<void> {
  const t = CATALOGS[input.locale ?? 'ar'].auth.register;
  await page.getByLabel(t.name, { exact: true }).fill(input.name ?? 'Test Student');
  await page.getByLabel(t.email, { exact: true }).fill(input.email);
  await page.getByLabel(t.password, { exact: true }).fill(input.password ?? TEST_PASSWORD);
  await page.getByRole('checkbox').setChecked(input.consent ?? true);
}

/** Subject (English part) of the confirmation email (contracts/emails.md §3). */
export const VERIFY_SUBJECT = 'Confirm your email for Masari';

/** The link of the newest confirmation email captured for `email` (waits up to 10 s for one). */
export async function confirmationLink(email: string): Promise<string> {
  const message = await waitForEmail({
    to: email,
    subjectIncludes: VERIFY_SUBJECT,
    since: new Date(0),
  });
  return firstLink(message);
}

/**
 * Opens the link of the newest confirmation email for `email` and waits for the screen it lands on
 * (`/{locale}/email-verified`, success or error). Returns the link, so a test can open it again.
 */
export async function confirmEmail(page: Page, email: string): Promise<string> {
  const link = await confirmationLink(email);
  await page.goto(link);
  await page.waitForURL(/\/(ar|en)\/email-verified(\?|$)/);
  return link;
}

export type SignInInput = {
  email: string;
  password?: string;
  /** Language of the sign-in screen; default `ar`. */
  locale?: TestLocale;
  /** Query of the sign-in screen, e.g. `next=%2Fprivacy`; default none. */
  query?: string;
  /** Open the sign-in screen first (default true); false submits the form already on screen. */
  open?: boolean;
};

/**
 * Fills and submits the sign-in form and waits for the action's answer (a redirect or the re-rendered
 * form). Callers assert where it landed.
 */
export async function signIn(page: Page, input: SignInInput): Promise<void> {
  const locale = input.locale ?? 'ar';
  const t = CATALOGS[locale].auth.signIn;
  if (input.open ?? true) {
    await page.goto(`/${locale}/sign-in${input.query === undefined ? '' : `?${input.query}`}`);
  }
  await page.getByLabel(t.email, { exact: true }).fill(input.email);
  await page.getByLabel(t.password, { exact: true }).fill(input.password ?? TEST_PASSWORD);
  // Only the form's own POST (to the sign-in screen, with or without JavaScript) ends the wait.
  const signInPath = `/${locale}/sign-in`;
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === signInPath,
    ),
    page.getByRole('button', { name: t.submit, exact: true }).click(),
  ]);
}

/** The user menu's trigger in the signed-in header (named "Account menu: <name>"). */
export function userMenuTrigger(page: Page, locale: TestLocale = 'ar') {
  const prefix = CATALOGS[locale].nav.userMenu.split('{name}')[0] ?? '';
  return page.getByRole('banner').getByRole('button', { name: prefix });
}

/**
 * Opens the user menu of the signed-in header and waits for it. Retries the click until the menu is
 * open, because a click that lands before hydration does nothing.
 */
export async function openUserMenu(page: Page, locale: TestLocale = 'ar'): Promise<void> {
  const menu = page.getByRole('menu');
  await expect(async () => {
    if (!(await menu.isVisible())) await userMenuTrigger(page, locale).click();
    await expect(menu).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/**
 * Signs out through the header — the user menu's sign-out item, or without JavaScript the plain
 * sign-out button that replaces the menu — and waits for the sign-in screen.
 */
export async function signOut(page: Page, locale: TestLocale = 'ar'): Promise<void> {
  const label = CATALOGS[locale].auth.signOut.submit;
  const plainButton = page.getByRole('banner').getByRole('button', { name: label, exact: true });
  if ((await plainButton.count()) > 0) {
    await plainButton.click();
  } else {
    await openUserMenu(page, locale);
    await page.getByRole('menuitem', { name: label }).click();
  }
  await page.waitForURL(new RegExp(`/${locale}/sign-in$`));
}

/**
 * Registers a new student through the screens (college `?u=` default `demo`), opens the confirmation
 * link, and returns the address. The browser is left signed out on the confirmation screen.
 */
export async function registerConfirmedStudent(
  page: Page,
  input: Partial<RegistrationInput> = {},
): Promise<string> {
  const email = input.email ?? uniqueEmail();
  const locale = input.locale ?? 'ar';
  await registerStudent(page, { ...input, email, locale });
  await page.waitForURL(`/${locale}/verify-email`);
  await confirmEmail(page, email);
  return email;
}
