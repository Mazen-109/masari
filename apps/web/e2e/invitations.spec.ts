import type { Page } from '@playwright/test';
import { DEMO_COLLEGE, DEMO_SLUG } from '@masari/db/admin';
import { E2E_BASE_URL } from './support/constants';
import { countAuditEvents, getUserByEmail } from './support/db';
import { countEmails, expectEmailCountStays, firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  INVITATION_SUBJECT,
  inviteStaff,
  registerConfirmedStudent,
  signIn,
  signInAsDemoAdmin,
  uniqueEmail,
} from './support/flows';
import { registerStudentWithProfile } from './support/students';

// The college administration invites staff (US5 acceptance scenarios 1–2; contracts/server-actions.md §5.2,
// contracts/routes.md §4; FR-020, FR-022, FR-040). Part 1: create and list. The demo administrator only
// adds invitations for new addresses; nothing about the demo college itself changes.

const { ar } = CATALOGS;

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: ar.nav.label });
}

function invitationRow(page: Page, email: string) {
  return page.locator('main [data-slot="invitations-table"] tbody tr', { hasText: email });
}

function formError(page: Page) {
  return page.locator('main [data-slot="form-error"]');
}

test('the administrator invites a faculty member, who accepts and signs in', async ({ page }) => {
  const email = uniqueEmail('faculty');
  const since = new Date();
  const auditsBefore = await countAuditEvents(DEMO_SLUG, 'invitation.created');

  // The dashboard's shortcut and the navigation lead to the screen.
  await signInAsDemoAdmin(page);
  await expect(
    mainNav(page).getByRole('link', { name: ar.nav.admin.invitations, exact: true }),
  ).toBeVisible();
  const shortcut = page.locator('main [data-shortcut="invitations"]');
  await expect(shortcut).toContainText(ar.dashboard.adminShortcuts.invitations);
  await shortcut.getByRole('link', { name: ar.nav.admin.invitations }).click();
  await expect(page).toHaveURL('/ar/admin/invitations');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.admin.invitations.title);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.adminInvitations));

  await inviteStaff(page, { email, role: 'faculty' });
  await expect(page.locator('main [data-slot="invite-sent"]')).toHaveText(
    ar.admin.invitations.form.sent,
  );
  // The form is empty again for the next invitation.
  await expect(page.getByLabel(ar.admin.invitations.form.email, { exact: true })).toHaveValue('');

  // A pending row with the role, the status in words, and dates in Western digits.
  const row = invitationRow(page, email);
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-status', 'pending');
  await expect(row.locator('[data-field="role"]')).toHaveText(ar.common.roles.faculty);
  await expect(row.locator('[data-field="status"]')).toHaveText(ar.common.statuses.pending);
  for (const field of ['createdAt', 'expiresAt']) {
    const text = (await row.locator(`[data-field="${field}"]`).innerText()).trim();
    expect(text).toMatch(/\d{4}/);
    expect(text).not.toMatch(/[٠-٩]/);
  }
  expect(await countAuditEvents(DEMO_SLUG, 'invitation.created')).toBeGreaterThan(auditsBefore);

  // One bilingual invitation email whose link is {APP_URL}/ar/invite/<token>.
  const message = await waitForEmail({ to: email, subjectIncludes: INVITATION_SUBJECT, since });
  expect(message.template).toBe('invitation');
  expect(message.subject).toContain(DEMO_COLLEGE.nameAr);
  expect(message.subject).toContain(DEMO_COLLEGE.nameEn);
  expect(message.text).toContain(ar.common.roles.faculty);
  expect(message.text).toContain(CATALOGS.en.common.roles.faculty);
  const link = firstLink(message);
  const invitePrefix = `${E2E_BASE_URL}/ar/invite/`;
  expect(link.startsWith(invitePrefix)).toBe(true);
  expect(link.slice(invitePrefix.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  await expectEmailCountStays(email, since, 1);

  // The invitee: the link opens the accept screen with the right college and role.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.locator('[data-slot="invite-college"]')).toHaveText(DEMO_COLLEGE.nameAr);
  await expect(page.locator('[data-slot="invite-role"]')).toHaveText(ar.common.roles.faculty);
  await acceptInvitation(page, { invitePath: '', open: false, name: 'Faculty Member' });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signIn(page, { email, open: false });
  // A faculty member is never sent to the students' onboarding step.
  await expect(page).toHaveURL('/ar/dashboard');
  expect(await getUserByEmail(email)).toMatchObject({ role: 'faculty', status: 'active' });
  await expect(page.locator('main [data-slot="admin-shortcuts"]')).toHaveCount(0);

  // Back with the administrator, the row is accepted.
  await page.context().clearCookies();
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await expect(invitationRow(page, email)).toHaveAttribute('data-status', 'accepted');
  await expect(invitationRow(page, email).locator('[data-field="status"]')).toHaveText(
    ar.common.statuses.accepted,
  );
});

for (const locale of ['ar', 'en'] as const) {
  test(`an address with an account and one already invited get the same refusal (${locale})`, async ({
    page,
  }) => {
    const t = CATALOGS[locale];
    // A confirmed student of the demo college (an account in any college counts).
    const accountEmail = await registerConfirmedStudent(page);
    const invitedEmail = uniqueEmail('twice');
    const since = new Date();

    await signInAsDemoAdmin(page);
    await page.goto(`/${locale}/admin/invitations`);
    await inviteStaff(page, { email: invitedEmail, role: 'student_affairs', locale });
    await expect(page.locator('main [data-slot="invite-sent"]')).toBeVisible();

    const refusals: string[] = [];
    for (const email of [accountEmail, invitedEmail]) {
      await inviteStaff(page, { email, role: 'faculty', locale });
      await expect(formError(page)).toHaveAttribute('data-code', 'validation');
      const field = page.getByLabel(t.admin.invitations.form.email, { exact: true });
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      // The entered address stays in the field.
      await expect(field).toHaveValue(email);
      await expect(page.locator('#invite-email-error')).toHaveText(
        t.admin.invitations.form.emailUnavailable,
      );
      await expect(page.locator('main [data-slot="invite-sent"]')).toHaveCount(0);
      refusals.push(await page.locator('main form').innerText());
    }
    // Word for word the same screen: the two cases cannot be told apart.
    expect(refusals[0]).toBe(refusals[1]);

    // Nothing was created or sent for either address.
    await expect(invitationRow(page, accountEmail)).toHaveCount(0);
    await expect(invitationRow(page, invitedEmail)).toHaveCount(1);
    await expect(invitationRow(page, invitedEmail).locator('[data-field="role"]')).toHaveText(
      t.common.roles.student_affairs,
    );
    expect(await countEmails({ to: accountEmail, since })).toBe(0);
    await expectEmailCountStays(invitedEmail, since, 1);
  });
}

test('a student opening the invitations screen gets the 404 page', async ({ page }) => {
  const email = await registerStudentWithProfile(page);
  await signIn(page, { email });
  await page.waitForURL('/ar/dashboard');
  await expect(page.locator('main [data-slot="admin-shortcuts"]')).toHaveCount(0);
  await expect(
    mainNav(page).getByRole('link', { name: ar.nav.admin.invitations, exact: true }),
  ).toHaveCount(0);

  const response = await page.goto('/ar/admin/invitations');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.common.notFound.title);
  await expect(page).toHaveTitle(ar.meta.titleTemplate.replace('%s', ar.meta.notFound));
  await expect(page.locator('main')).not.toContainText(ar.admin.invitations.form.title);
  await expect(page.locator('main form')).toHaveCount(0);
});

/** The table's scroll region, named by the list heading. */
function tableRegion(page: Page) {
  return page.getByRole('region', { name: ar.admin.invitations.list.title, exact: true });
}

test('the form card and the table share one column', async ({ page }) => {
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  const card = await page.locator('main [data-slot="invite"]').boundingBox();
  const table = await tableRegion(page).boundingBox();
  expect(card).not.toBeNull();
  expect(table).not.toBeNull();
  if (card !== null && table !== null) {
    expect(Math.abs(card.x - table.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.width - table.width)).toBeLessThanOrEqual(1);
  }
  // Wide enough on a desktop: no sideways scrolling and no hint.
  expect(await tableRegion(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  await expect(page.getByText(ar.admin.invitations.list.scrollHint)).toBeHidden();
});

test('@mobile at 320 px the table scrolls sideways inside a labelled, focusable region', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');

  const region = tableRegion(page);
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(region).toHaveAccessibleDescription(ar.admin.invitations.list.scrollHint);
  await expect(page.getByText(ar.admin.invitations.list.scrollHint)).toBeVisible();

  // The table overflows its region, never the page.
  expect(await region.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // Keyboard: focus the region and the arrow key scrolls it towards the last column (to the left in Arabic).
  const lastHeader = region.getByRole('columnheader', {
    name: ar.admin.invitations.list.expiresAt,
  });
  await expect(lastHeader).not.toBeInViewport();
  await region.focus();
  await expect(region).toBeFocused();
  await expect(async () => {
    await page.keyboard.press('ArrowLeft');
    await expect(lastHeader).toBeInViewport({ timeout: 200 });
  }).toPass({ timeout: 10_000 });
});
