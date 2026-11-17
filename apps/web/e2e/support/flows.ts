import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
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
