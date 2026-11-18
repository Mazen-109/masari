import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ROLES_DIR } from './constants';
import { firstLink, waitForEmail } from './emails';
import type { StorageState } from './forge';
import {
  acceptInvitation,
  completeProfile,
  INVITATION_SUBJECT,
  inviteStaff,
  registerConfirmedStudent,
  signIn,
  uniqueEmail,
  type InvitableRole,
} from './flows';
import { createCollege, uniqueCollegeSlug } from './operator';

// One signed-in user per role, in a college of their own (contracts/permissions.md §5; T119). The first
// test that needs a role (across all workers: the lock file is created exclusively) builds the college
// through the screens — the administrator from the operator's link, faculty and Student Affairs from the
// administrator's invitations, the student by registering and completing the profile — and saves every
// role's cookies. The other tests reuse them, so no per-email sign-in limit is approached. Tests that use
// these sessions must never sign out; to switch users they clear the context's cookies.

export type AppRole = InvitableRole;

export const APP_ROLES = [
  'student',
  'faculty',
  'student_affairs',
  'admin',
] as const satisfies readonly AppRole[];

export type RoleCollege = {
  slug: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  /** The address of each role's account. */
  emails: Record<AppRole, string>;
  /** An invitation the administrator sent and nobody accepted: a row with a revoke form. */
  pendingInvitationEmail: string;
};

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROLES_DIR = path.resolve(WEB_ROOT, E2E_ROLES_DIR);
const LOCK_FILE = path.join(ROLES_DIR, 'lock');
const ACCOUNTS_FILE = path.join(ROLES_DIR, 'accounts.json');
const stateFile = (role: AppRole) => path.join(ROLES_DIR, `${role}.json`);

/** How long a worker waits for another worker to finish building the college. */
const BUILD_WAIT_MS = 150_000;
/**
 * Age (by modification time) after which a lock counts as left behind by a killed run: twice the wait, so a
 * builder that is still working — slower than the wait, which only makes the waiting workers give up — never
 * has its lock taken away and a second college built beside it.
 */
const STALE_LOCK_MS = 2 * BUILD_WAIT_MS;
const POLL_MS = 250;

/**
 * Writes to a temporary file first and renames it over `file`, so a reader in another worker sees the old
 * file or the new one, never half of it.
 */
async function writeAtomically(file: string, content: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** The parsed JSON of `file`, or null when it is missing or unparsable (e.g. from a killed run). */
async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readAccounts(): Promise<RoleCollege | null> {
  const saved = await readJson(ACCOUNTS_FILE);
  if (!isRecord(saved) || !isRecord(saved.emails)) return null;
  const emails = saved.emails;
  const strings = [saved.slug, saved.tenantId, saved.nameAr, saved.nameEn];
  strings.push(saved.pendingInvitationEmail, ...APP_ROLES.map((role) => emails[role]));
  return strings.every((value) => typeof value === 'string') ? (saved as RoleCollege) : null;
}

async function readCookies(role: AppRole): Promise<StorageState['cookies'] | null> {
  const saved = await readJson(stateFile(role));
  if (!isRecord(saved) || !Array.isArray(saved.cookies)) return null;
  return saved.cookies as StorageState['cookies'];
}

async function saveState(role: AppRole, context: BrowserContext): Promise<void> {
  await writeAtomically(stateFile(role), JSON.stringify(await context.storageState()));
}

/** Signs in through the sign-in form already on screen or opened afresh, and waits for the dashboard. */
async function signInToDashboard(page: Page, email: string, open = true): Promise<void> {
  await signIn(page, { email, open });
  // Staff and an onboarded student land on the dashboard, never on /onboarding.
  await page.waitForURL('/ar/dashboard');
}

/** Builds the college and every role's account through the screens; the page ends signed out. */
async function buildRoleCollege(page: Page): Promise<RoleCollege> {
  const context = page.context();
  const adminEmail = uniqueEmail('rbac-admin');
  const college = await createCollege(uniqueCollegeSlug('rbac'), adminEmail);

  await acceptInvitation(page, { invitePath: college.invitePath, name: 'Role Administrator' });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signInToDashboard(page, adminEmail, false);
  await saveState('admin', context);

  // The administrator's own `invite-create` bucket (new account): three invitations stay far below it.
  const invited = {
    faculty: uniqueEmail('rbac-faculty'),
    student_affairs: uniqueEmail('rbac-affairs'),
  };
  const pendingInvitationEmail = uniqueEmail('rbac-pending');
  const since = new Date();
  await page.goto('/ar/admin/invitations');
  for (const [email, role] of [
    [invited.faculty, 'faculty'],
    [invited.student_affairs, 'student_affairs'],
    [pendingInvitationEmail, 'faculty'],
  ] as const) {
    await inviteStaff(page, { email, role });
    await expect(page.locator('main [data-slot="invite-sent"]')).toBeVisible();
  }

  for (const role of ['faculty', 'student_affairs'] as const) {
    const email = invited[role];
    const message = await waitForEmail({ to: email, subjectIncludes: INVITATION_SUBJECT, since });
    await context.clearCookies();
    await page.goto(firstLink(message));
    await acceptInvitation(page, { invitePath: '', open: false, name: `Role ${role}` });
    await page.waitForURL('/ar/sign-in?invited=1');
    await signInToDashboard(page, email, false);
    await saveState(role, context);
  }

  await context.clearCookies();
  const studentEmail = await registerConfirmedStudent(page, {
    college: college.slug,
    email: uniqueEmail('rbac-student'),
    name: 'Role Student',
  });
  await signIn(page, { email: studentEmail });
  await page.waitForURL('/ar/onboarding');
  await completeProfile(page);
  await page.waitForURL('/ar/dashboard');
  await saveState('student', context);
  await context.clearCookies();

  return {
    slug: college.slug,
    tenantId: college.tenantId,
    nameAr: college.nameAr,
    nameEn: college.nameEn,
    emails: { admin: adminEmail, ...invited, student: studentEmail },
    pendingInvitationEmail,
  };
}

/**
 * Removes a lock file older than STALE_LOCK_MS (by modification time): its builder was killed without
 * removing it (e.g. an interrupted run that reused the directory), and it would block every later attempt.
 * The lock is first moved aside under a unique name (rename is atomic, so one worker claims it) and checked
 * again there: when another worker replaced it with a fresh lock in between, that lock is put back.
 */
async function removeStaleLock(): Promise<void> {
  const isStale = async (file: string) => Date.now() - (await stat(file)).mtimeMs > STALE_LOCK_MS;
  try {
    if (!(await isStale(LOCK_FILE))) return;
    const claimed = `${LOCK_FILE}.${process.pid}.${randomUUID()}.stale`;
    await rename(LOCK_FILE, claimed);
    if (!(await isStale(claimed))) {
      // A fresh lock: restore it unless yet another lock exists by now (link fails then).
      await link(claimed, LOCK_FILE).catch(() => undefined);
    }
    await rm(claimed, { force: true });
  } catch (error) {
    // ENOENT: no lock, or another worker removed or claimed it first.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * The role college, built on first use. A worker that finds the lock taken waits for `accounts.json`; when
 * the builder fails it removes the lock, and the next worker to look builds a new college. A lock left by a
 * killed run is removed once it is older than twice the wait.
 */
export async function ensureRoleCollege(page: Page): Promise<RoleCollege> {
  const deadline = Date.now() + BUILD_WAIT_MS;
  await mkdir(ROLES_DIR, { recursive: true });
  for (;;) {
    const saved = await readAccounts();
    if (saved !== null) return saved;
    await removeStaleLock();
    let lock: FileHandle | null = null;
    try {
      lock = await open(LOCK_FILE, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (lock !== null) {
      try {
        const built = await buildRoleCollege(page);
        await writeAtomically(ACCOUNTS_FILE, JSON.stringify(built));
        return built;
      } catch (error) {
        await rm(LOCK_FILE, { force: true });
        throw error;
      } finally {
        await lock.close();
      }
    }
    if (Date.now() > deadline) throw new Error('roles: another worker did not finish the college');
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Puts the saved session of `role` into the context; true when it still opens the dashboard. */
async function reuseSession(page: Page, role: AppRole): Promise<boolean> {
  const cookies = await readCookies(role);
  if (cookies === null) return false;
  try {
    await page.context().addCookies(cookies);
  } catch {
    // Cookies the browser refuses: treated like no saved session.
    return false;
  }
  await page.goto('/ar/dashboard');
  return new URL(page.url()).pathname === '/ar/dashboard';
}

/**
 * Signs the page in as the role college's `role` and leaves it on `/ar/dashboard`: the saved session when
 * it still works, otherwise a fresh sign-in whose cookies replace the saved ones.
 */
export async function signInAs(page: Page, role: AppRole): Promise<RoleCollege> {
  const college = await ensureRoleCollege(page);
  const context = page.context();
  await context.clearCookies();
  if (await reuseSession(page, role)) return college;
  await context.clearCookies();
  await signInToDashboard(page, college.emails[role]);
  await saveState(role, context);
  return college;
}

/** A working signed-in storage state of `role` (the page is left signed in as that role). */
export async function roleStorageState(page: Page, role: AppRole): Promise<StorageState> {
  await signInAs(page, role);
  return page.context().storageState();
}
