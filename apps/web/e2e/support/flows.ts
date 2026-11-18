import { randomBytes, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, stat, writeFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_ADMIN_EMAIL } from '@masari/db/admin';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import ar from '../../messages/ar.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import { E2E_DEMO_ADMIN_DIR } from './constants';
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

export type AcceptInvitationInput = {
  /** Locale-less path of the invitation link (`/invite/<token>`). */
  invitePath: string;
  locale?: TestLocale;
  name?: string;
  password?: string;
  consent?: boolean;
  /** Open the invitation screen first (default true); false submits the form already on screen. */
  open?: boolean;
};

/**
 * Opens the invitation link, fills the form, and submits it. Does not wait for the result: callers assert
 * the URL (`/{locale}/sign-in?invited=1` on success) or the errors.
 */
export async function acceptInvitation(page: Page, input: AcceptInvitationInput): Promise<void> {
  const locale = input.locale ?? 'ar';
  const t = CATALOGS[locale].auth.invite;
  if (input.open ?? true) await page.goto(`/${locale}${input.invitePath}`);
  await page.getByLabel(t.name, { exact: true }).fill(input.name ?? 'Test Administrator');
  await page.getByLabel(t.password, { exact: true }).fill(input.password ?? TEST_PASSWORD);
  await page.getByRole('checkbox').setChecked(input.consent ?? true);
  await page.getByRole('button', { name: t.submit }).click();
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

/** A student code no other test uses: `S-` and 10 hex digits (valid: Latin letters, digits, hyphen). */
export function uniqueStudentCode(): string {
  return `S-${randomBytes(5).toString('hex')}`;
}

export type ProfileInput = {
  /** Default: a new unique code. */
  studentCode?: string;
  /** Visible label of the level option; default the first level. */
  level?: string;
  /** Visible label of the division option; default the first division offered. */
  division?: string;
  locale?: TestLocale;
};

/** What `completeProfile` entered and chose, as shown on screen. */
export type CompletedProfile = { studentCode: string; level: string; division: string };

/**
 * Fills and submits the onboarding form already on screen. Does not wait for the result: callers assert
 * the URL or the errors. Returns what was entered.
 */
export async function completeProfile(
  page: Page,
  input: ProfileInput = {},
): Promise<CompletedProfile> {
  const t = CATALOGS[input.locale ?? 'ar'].onboarding;
  const studentCode = input.studentCode ?? uniqueStudentCode();
  await page.getByLabel(t.studentCode, { exact: true }).fill(studentCode);
  const level = page.getByLabel(t.level, { exact: true });
  const division = page.getByLabel(t.division, { exact: true });
  // Index 0 is the placeholder.
  const chosenLevel = await level.selectOption(
    input.level === undefined ? { index: 1 } : { label: input.level },
  );
  const chosenDivision = await division.selectOption(
    input.division === undefined ? { index: 1 } : { label: input.division },
  );
  const labelOf = async (select: typeof level, value: string | undefined) =>
    (await select.locator(`option[value="${value ?? ''}"]`).textContent()) ?? '';
  const result = {
    studentCode,
    level: await labelOf(level, chosenLevel[0]),
    division: await labelOf(division, chosenDivision[0]),
  };
  await page.getByRole('button', { name: t.submit }).click();
  return result;
}

/**
 * A student who can use the app: registers (college `?u=` default `demo`), confirms the address, signs
 * in, completes the academic profile, and signs out again. Returns the address; the browser is left signed
 * out on the sign-in screen. Use it wherever a test expects a signed-in student to reach the dashboard.
 */
export async function registerOnboardedStudent(
  page: Page,
  input: Partial<RegistrationInput> & { profile?: ProfileInput } = {},
): Promise<string> {
  const { profile, ...registration } = input;
  const locale = registration.locale ?? 'ar';
  const email = await registerConfirmedStudent(page, registration);
  await signIn(page, { email, locale });
  await page.waitForURL(new RegExp(`/${locale}/onboarding$`));
  await completeProfile(page, { locale, ...profile });
  await page.waitForURL(`/${locale}/dashboard`);
  await signOut(page, locale);
  return email;
}

export type InvitableRole = keyof typeof ar.common.roles;

/** Subject (English part) of the invitation email (contracts/emails.md §3). */
export const INVITATION_SUBJECT = 'Invitation to join';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEMO_ADMIN_DIR = path.resolve(WEB_ROOT, E2E_DEMO_ADMIN_DIR);
const DEMO_ADMIN_FILES = {
  token: path.join(DEMO_ADMIN_DIR, 'token'),
  lock: path.join(DEMO_ADMIN_DIR, 'lock'),
  accepted: path.join(DEMO_ADMIN_DIR, 'accepted'),
  state: path.join(DEMO_ADMIN_DIR, 'state.json'),
};
const DEMO_ADMIN_WAIT_MS = 20_000;

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The demo administrator's account exists: the first caller (across all workers: the lock file is created
 * exclusively) accepts the seed's invitation through the invitation screen and leaves the `accepted`
 * marker; the others wait for it. A failed acceptance removes the lock, so a retry can try again.
 */
async function ensureDemoAdmin(page: Page): Promise<void> {
  if (await exists(DEMO_ADMIN_FILES.accepted)) return;
  let lock: FileHandle;
  try {
    lock = await open(DEMO_ADMIN_FILES.lock, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await expect
      .poll(() => exists(DEMO_ADMIN_FILES.accepted), { timeout: DEMO_ADMIN_WAIT_MS })
      .toBe(true);
    return;
  }
  try {
    const token = (await readFile(DEMO_ADMIN_FILES.token, 'utf8')).trim();
    await acceptInvitation(page, { invitePath: `/invite/${token}`, name: 'Demo Administrator' });
    await page.waitForURL('/ar/sign-in?invited=1');
    await writeFile(DEMO_ADMIN_FILES.accepted, '');
  } catch (error) {
    await rm(DEMO_ADMIN_FILES.lock, { force: true });
    throw error;
  } finally {
    await lock.close();
  }
}

type SavedCookies = Parameters<BrowserContext['addCookies']>[0];

/** The cookies of the saved demo administrator session, or null when there is none or it is unreadable. */
async function readSavedCookies(): Promise<SavedCookies | null> {
  let text: string;
  try {
    text = await readFile(DEMO_ADMIN_FILES.state, 'utf8');
  } catch {
    return null;
  }
  try {
    const saved: unknown = JSON.parse(text);
    if (typeof saved !== 'object' || saved === null || !('cookies' in saved)) return null;
    return Array.isArray(saved.cookies) ? (saved.cookies as SavedCookies) : null;
  } catch {
    // Unparsable (e.g. written by a run that was killed half-way): sign in afresh.
    return null;
  }
}

/**
 * Saves the context's cookies for the other tests: written to a temporary file first and then renamed over
 * `state.json`, so a reader in another worker sees either the old file or the new one, never half of it.
 */
async function saveDemoAdminSession(context: BrowserContext): Promise<void> {
  const temporary = `${DEMO_ADMIN_FILES.state}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(await context.storageState()));
    await rename(temporary, DEMO_ADMIN_FILES.state);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Puts the saved demo administrator session into the context; true when it still opens the dashboard. */
async function reuseDemoAdminSession(page: Page, context: BrowserContext): Promise<boolean> {
  const cookies = await readSavedCookies();
  if (cookies === null) return false;
  try {
    await context.addCookies(cookies);
  } catch {
    // Cookies the browser refuses: treated like no saved session.
    return false;
  }
  await page.goto('/ar/dashboard');
  return /\/(ar|en)\/dashboard$/.test(new URL(page.url()).pathname);
}

/**
 * Signs the page in as the demo college's administrator (DEMO_ADMIN_EMAIL, created from the seed's
 * invitation on first use) and leaves it on the dashboard. One sign-in is shared by the whole run — its
 * cookies are saved and reused — so the per-email sign-in limit is never reached; when the saved session
 * no longer works (e.g. a test signed it out) or the saved file cannot be read, it signs in afresh. Tests that use it must not sign the
 * administrator out; to switch users, clear the context's cookies instead.
 */
export async function signInAsDemoAdmin(page: Page): Promise<void> {
  await ensureDemoAdmin(page);
  const context = page.context();
  if (await reuseDemoAdminSession(page, context)) return;
  await context.clearCookies();
  await signIn(page, { email: DEMO_ADMIN_EMAIL });
  await page.waitForURL(/\/(ar|en)\/dashboard$/);
  await saveDemoAdminSession(context);
}

/** The invite form of the invitations screen (the table below has a revoke form per pending row). */
export function inviteForm(page: Page) {
  return page.locator('main [data-slot="invite"] form');
}

export type InviteInput = { email: string; role: InvitableRole; locale?: TestLocale };

/**
 * Fills and submits the invite form of the invitations screen already on screen (`/{locale}/admin/
 * invitations`) and waits for the action's answer. Callers assert the "sent" status or the errors.
 */
export async function inviteStaff(page: Page, input: InviteInput): Promise<void> {
  const locale = input.locale ?? 'ar';
  const t = CATALOGS[locale];
  const form = inviteForm(page);
  await form.getByLabel(t.admin.invitations.form.email, { exact: true }).fill(input.email);
  await form
    .getByLabel(t.admin.invitations.form.role, { exact: true })
    .selectOption({ label: t.common.roles[input.role] });
  const screenPath = `/${locale}/admin/invitations`;
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === screenPath,
    ),
    form.getByRole('button', { name: t.admin.invitations.form.submit }).click(),
  ]);
}

/**
 * The demo administrator invites a new address with `role` through the invitations screen; the invitee
 * then opens the emailed link (with the administrator's cookies cleared, not signed out) and accepts.
 * Returns the address; the browser is left signed out on `/ar/sign-in?invited=1`.
 */
export async function inviteAndAccept(page: Page, role: InvitableRole): Promise<string> {
  const email = uniqueEmail(role.replace('_', '-'));
  const since = new Date();
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email, role });
  await expect(page.locator('main [data-slot="invite-sent"]')).toBeVisible();
  const message = await waitForEmail({ to: email, subjectIncludes: INVITATION_SUBJECT, since });
  await page.context().clearCookies();
  await page.goto(firstLink(message));
  await acceptInvitation(page, { invitePath: '', open: false });
  await page.waitForURL('/ar/sign-in?invited=1');
  return email;
}
