import type { Page } from '@playwright/test';
import { DEMO_COLLEGE, DEMO_SLUG } from '@masari/db/admin';
import { E2E_BASE_URL } from './support/constants';
import {
  countAuditEvents,
  expireInvitation,
  getUserByEmail,
  resetDemoAdminInviteBucket,
} from './support/db';
import { countEmails, expectEmailCountStays, firstLink, waitForEmail } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  INVITATION_SUBJECT,
  inviteForm,
  inviteStaff,
  registerConfirmedStudent,
  registerStudent,
  signIn,
  signInAsDemoAdmin,
  uniqueEmail,
} from './support/flows';
import { setFormField } from './support/forge';
import { createCollege, uniqueCollegeSlug } from './support/operator';
import { registerStudentWithProfile } from './support/students';

// The college administration invites staff (US5 acceptance scenarios 1–3, 6; contracts/server-actions.md
// §4.1 step 6, §5.2, contracts/routes.md §4; FR-020, FR-022, FR-023, FR-040). Part 1: create and list;
// part 2: revoke, expiry, and self-registration with an invited address. The demo administrator only adds
// (and revokes) invitations for new addresses; nothing about the demo college itself changes.

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

function inviteSent(page: Page) {
  return page.locator('main [data-slot="invite-sent"]');
}

// The demo administrator's `invite-create` bucket (60 per hour) is shared by every test of the run, also
// by retries and repeated local runs against one database: each test starts with it empty. Only that
// administrator's bucket is emptied; other administrators' buckets are left as they are.
test.beforeEach(async () => {
  await resetDemoAdminInviteBucket();
});

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
      refusals.push(await inviteForm(page).innerText());
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
  // Once measured in the browser, the hint stays hidden and describes nothing.
  const hint = page.locator('main [data-slot="scroll-hint"]');
  await expect(hint).toHaveClass(/(^|\s)hidden(\s|$)/);
  await expect(hint).toBeHidden();
  await expect(tableRegion(page)).not.toHaveAttribute('aria-describedby');
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
  // Only the horizontal position is compared: with many invitations the region is taller than the screen,
  // so whether the header row is vertically in view depends on where focusing scrolled the page.
  const lastHeader = region.getByRole('columnheader', {
    name: ar.admin.invitations.list.actions,
  });
  const lastColumnShown = async (): Promise<boolean> => {
    const [header, box] = [await lastHeader.boundingBox(), await region.boundingBox()];
    if (header === null || box === null) return false;
    return header.x >= box.x - 1 && header.x + header.width <= box.x + box.width + 1;
  };
  expect(await lastColumnShown()).toBe(false);
  await region.focus();
  await expect(region).toBeFocused();
  // Each press scrolls about 40 px: press until the last column is in view (a plain loop, not toPass,
  // whose growing retry intervals would allow only a dozen presses).
  let shown = false;
  for (let press = 0; press < 80 && !shown; press += 1) {
    await page.keyboard.press('ArrowLeft');
    shown = await lastColumnShown();
  }
  // A smooth scroll may still be running after the last press.
  await expect.poll(lastColumnShown).toBe(true);
  await expect(region).toBeFocused();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The revoke button of a row; its name ends with the (visually hidden) address. */
function revokeButton(page: Page, email: string) {
  return invitationRow(page, email).getByRole('button', {
    name: ar.admin.invitations.list.revoke,
  });
}

test('the administrator revokes a pending invitation and its link stops working', async ({
  page,
}) => {
  const email = uniqueEmail('revoked');
  const since = new Date();
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email, role: 'faculty' });
  await expect(inviteSent(page)).toBeVisible();
  const link = firstLink(
    await waitForEmail({ to: email, subjectIncludes: INVITATION_SUBJECT, since }),
  );

  const invitationId = await invitationRow(page, email).getAttribute('data-invitation');
  expect(invitationId).toMatch(UUID);
  expect(await countAuditEvents(DEMO_SLUG, 'invitation.revoked', invitationId ?? '')).toBe(0);
  const button = revokeButton(page, email);
  await expect(button).toHaveAccessibleName(
    `${ar.admin.invitations.list.revoke} ${ar.admin.invitations.list.revokeTarget.replace('<bdi>{email}</bdi>', email)}`,
  );
  await button.click();
  const row = invitationRow(page, email);
  await expect(row).toHaveAttribute('data-status', 'revoked');
  await expect(row.locator('[data-field="status"]')).toHaveText(ar.common.statuses.revoked);
  await expect(revokeButton(page, email)).toHaveCount(0);
  // Exactly one invitation.revoked row, about this invitation.
  expect(await countAuditEvents(DEMO_SLUG, 'invitation.revoked', invitationId ?? '')).toBe(1);

  // The invitee's link now shows the "no longer valid" screen, without the form.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ar.auth.invite.invalidTitle);
  await expect(page.locator('main form')).toHaveCount(0);
});

test("revoking another college's invitation through a forged form is not_found and changes nothing", async ({
  page,
}) => {
  // Another college's administrator invites someone; the row's id is read from their own screen.
  const otherAdmin = uniqueEmail('other-admin');
  const college = await createCollege(uniqueCollegeSlug('rvk'), otherAdmin);
  await acceptInvitation(page, { invitePath: college.invitePath, name: 'Other Administrator' });
  await page.waitForURL('/ar/sign-in?invited=1');
  await signIn(page, { email: otherAdmin, open: false });
  await page.waitForURL('/ar/dashboard');
  const foreignEmail = uniqueEmail('foreign');
  const since = new Date();
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email: foreignEmail, role: 'faculty' });
  await expect(inviteSent(page)).toBeVisible();
  const foreignId = await invitationRow(page, foreignEmail).getAttribute('data-invitation');
  expect(foreignId).toMatch(UUID);
  const foreignLink = firstLink(
    await waitForEmail({ to: foreignEmail, subjectIncludes: INVITATION_SUBJECT, since }),
  );

  // The demo administrator puts that id into the revoke form of a row of their own screen.
  await page.context().clearCookies();
  const ownEmail = uniqueEmail('own');
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email: ownEmail, role: 'faculty' });
  await expect(inviteSent(page)).toBeVisible();
  const ownRow = invitationRow(page, ownEmail);
  const form = ownRow.locator('form');
  await setFormField(form, 'invitationId', foreignId ?? '');
  await revokeButton(page, ownEmail).click();
  await expect(form.locator('[data-slot="form-error"]')).toHaveAttribute('data-code', 'not_found');
  await expect(form.locator('[data-slot="form-error"]')).toContainText(ar.errors.not_found);

  // Nothing changed: the own row is still pending, the other college has no revocation, and its
  // invitation still opens the accept form.
  await expect(ownRow).toHaveAttribute('data-status', 'pending');
  expect(await countAuditEvents(college.slug, 'invitation.revoked')).toBe(0);
  await page.context().clearCookies();
  await page.goto(foreignLink);
  await expect(page.locator('[data-slot="invite-college"]')).toHaveText(college.nameAr);
});

test('registering with an invited address only reminds of the invitation and creates no account', async ({
  page,
}) => {
  const email = uniqueEmail('invited-student');
  // FR-020 allows inviting students too.
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email, role: 'student' });
  await expect(inviteSent(page)).toBeVisible();
  await page.context().clearCookies();

  const since = new Date();
  await registerStudent(page, { email });
  // The same "check your email" screen as for a new address (FR-005).
  await expect(page).toHaveURL('/ar/verify-email');
  const message = await waitForEmail({
    to: email,
    subjectIncludes: 'You have an invitation to join Masari',
    since,
  });
  expect(message.template).toBe('invitation-pending');
  expect(message.text).toContain(DEMO_COLLEGE.nameAr);
  // One message, and no confirmation email among them.
  await expectEmailCountStays(email, since, 1);
  expect(await getUserByEmail(email)).toBeNull();
});

test('an expired invitation shows as expired and can be replaced by a new one', async ({
  page,
}) => {
  const email = uniqueEmail('expired');
  await signInAsDemoAdmin(page);
  await page.goto('/ar/admin/invitations');
  await inviteStaff(page, { email, role: 'student_affairs' });
  await expect(inviteSent(page)).toBeVisible();

  await expireInvitation(email);
  await page.goto('/ar/admin/invitations');
  const row = invitationRow(page, email);
  await expect(row).toHaveAttribute('data-status', 'expired');
  await expect(row.locator('[data-field="status"]')).toHaveText(ar.common.statuses.expired);
  // An expired invitation is still pending in storage: it can be revoked.
  await expect(revokeButton(page, email)).toHaveCount(1);

  const since = new Date();
  await inviteStaff(page, { email, role: 'student_affairs' });
  await expect(inviteSent(page)).toBeVisible();
  // The new invitation is pending; the expired one was revoked when it was replaced.
  const rowWith = (status: string) =>
    page.locator(`main [data-slot="invitations-table"] tbody tr[data-status="${status}"]`, {
      hasText: email,
    });
  await expect(invitationRow(page, email)).toHaveCount(2);
  await expect(rowWith('pending')).toHaveCount(1);
  await expect(rowWith('revoked')).toHaveCount(1);

  const link = firstLink(
    await waitForEmail({ to: email, subjectIncludes: INVITATION_SUBJECT, since }),
  );
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.locator('[data-slot="invite-role"]')).toHaveText(
    ar.common.roles.student_affairs,
  );
});
