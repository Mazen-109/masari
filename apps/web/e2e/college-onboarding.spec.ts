import type { Browser, Page } from '@playwright/test';
import { addDivision, countAuditEvents, countSessions, getUserByEmail } from './support/db';
import { countEmails } from './support/emails';
import { expect, test } from './support/fixtures';
import {
  acceptInvitation,
  CATALOGS,
  openUserMenu,
  registerConfirmedStudent,
  signIn,
  uniqueEmail,
  type TestLocale,
} from './support/flows';
import {
  createCollege,
  setCollegeStatus,
  uniqueCollegeSlug,
  type OnboardedCollege,
} from './support/operator';

// The operator onboards a college and its first administrator (US4 acceptance scenarios 2–5;
// contracts/server-actions.md §4.7, contracts/routes.md §2; FR-009, FR-011, FR-019, FR-020, FR-021).
// Every test works in colleges it creates itself (contracts/ci.md §3) and never invites the demo
// college's administrator address, for which the seed already holds a pending invitation.

const { ar } = CATALOGS;

function formError(page: Page) {
  return page.locator('main [data-slot="form-error"]');
}

/** A new college with a pending administrator invitation for a new address. */
async function newCollege(): Promise<OnboardedCollege & { adminEmail: string }> {
  const adminEmail = uniqueEmail('dean');
  return { ...(await createCollege(uniqueCollegeSlug(), adminEmail)), adminEmail };
}

async function expectInvalidInvitationScreen(page: Page, locale: TestLocale = 'ar'): Promise<void> {
  const t = CATALOGS[locale].auth.invite;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.invalidTitle);
  await expect(page.getByText(t.invalidBody)).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
}

/** Accepts the college's invitation, signs in, and waits for the dashboard. */
async function onboardAdmin(
  page: Page,
  college: OnboardedCollege & { adminEmail: string },
  locale: TestLocale = 'ar',
): Promise<void> {
  await acceptInvitation(page, { invitePath: college.invitePath, locale });
  await page.waitForURL(`/${locale}/sign-in?invited=1`);
  await signIn(page, { email: college.adminEmail, locale, open: false });
  await page.waitForURL(`/${locale}/dashboard`);
}

type DeviceOptions = { baseURL?: string; extraHTTPHeaders?: Record<string, string> };

/**
 * A page in a browser context of its own (another device), with the test's base URL and client address.
 * The caller closes its context.
 */
async function otherDevice(browser: Browser, options: DeviceOptions): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

for (const locale of ['ar', 'en'] as const) {
  test(`the invited administrator accepts, signs in, and sees the college and role (${locale})`, async ({
    page,
  }) => {
    const t = CATALOGS[locale];
    const college = await newCollege();
    const collegeName = locale === 'ar' ? college.nameAr : college.nameEn;
    const since = new Date();

    await page.goto(`/${locale}${college.invitePath}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(collegeName);
    await expect(page.locator('[data-slot="invite-college"]')).toHaveText(collegeName);
    await expect(page.locator('[data-slot="invite-role"]')).toHaveText(t.common.roles.admin);

    await acceptInvitation(page, { invitePath: college.invitePath, locale, open: false });
    await page.waitForURL(`/${locale}/sign-in?invited=1`);
    await expect(page.locator('[data-slot="sign-in-invited"]')).toHaveText(t.auth.signIn.invited);

    const user = await getUserByEmail(college.adminEmail);
    expect(user).toMatchObject({
      tenantId: college.tenantId,
      role: 'admin',
      emailVerified: true,
      status: 'active',
      locale,
      name: 'Test Administrator',
    });
    expect(user?.privacyConsentAt).toBeInstanceOf(Date);
    expect(await countAuditEvents(college.slug, 'invitation.accepted')).toBe(1);
    // The link proved the address: no confirmation email is sent.
    expect(await countEmails({ to: college.adminEmail, since })).toBe(0);

    await signIn(page, { email: college.adminEmail, locale, open: false });
    await page.waitForURL(`/${locale}/dashboard`);
    await expect(page.locator('main')).toContainText(collegeName);
    await openUserMenu(page, locale);
    await expect(page.getByRole('menu')).toContainText(t.common.roles.admin);
    expect(await countEmails({ to: college.adminEmail, since })).toBe(0);
  });
}

test('a used invitation link shows the invalid screen and its form is refused', async ({
  page,
}) => {
  const college = await newCollege();
  await page.goto(`/ar${college.invitePath}`);
  // A second tab still has the form of the same link.
  const staleForm = await page.context().newPage();
  await staleForm.goto(`/ar${college.invitePath}`);

  await acceptInvitation(page, { invitePath: college.invitePath, open: false });
  await page.waitForURL('/ar/sign-in?invited=1');

  await page.goto(`/ar${college.invitePath}`);
  await expectInvalidInvitationScreen(page);

  await acceptInvitation(staleForm, {
    invitePath: college.invitePath,
    name: 'Someone Else',
    open: false,
  });
  await expect(formError(staleForm)).toHaveAttribute('data-code', 'token_invalid');
  await expect(formError(staleForm)).toContainText(ar.errors.token_invalid);
  expect((await getUserByEmail(college.adminEmail))?.name).toBe('Test Administrator');
  expect(await countAuditEvents(college.slug, 'invitation.accepted')).toBe(1);
});

test('a tampered or unknown token shows the invalid screen', async ({ page }) => {
  const college = await newCollege();
  const token = college.invitePath.slice('/invite/'.length);
  const last = token.at(-1) === 'A' ? 'B' : 'A';

  for (const path of [
    `/invite/${token.slice(0, -1)}${last}`,
    `/invite/${token.slice(0, -1)}`,
    `/invite/${'Iv4_'.repeat(10)}a-Z`,
    '/invite/not-a-token',
  ]) {
    await page.goto(`/ar${path}`);
    await expectInvalidInvitationScreen(page);
  }
  // The real link still works afterwards.
  await page.goto(`/ar${college.invitePath}`);
  await expect(page.locator('[data-slot="invite-role"]')).toHaveText(ar.common.roles.admin);
});

test('a forged token in the form is refused and creates nothing', async ({ page }) => {
  const college = await newCollege();
  await page.goto(`/ar${college.invitePath}`);
  await page.locator('main form input[name="token"]').evaluate(
    (input, forged) => {
      (input as HTMLInputElement).value = forged;
    },
    `${'Iv4_'.repeat(10)}a-Z`,
  );

  await acceptInvitation(page, { invitePath: college.invitePath, open: false });

  await expect(formError(page)).toHaveAttribute('data-code', 'token_invalid');
  expect(await getUserByEmail(college.adminEmail)).toBeNull();
  // The real invitation is untouched.
  await page.goto(`/ar${college.invitePath}`);
  await expect(page.locator('main form')).toHaveCount(1);
});

test('two simultaneous submissions of one invitation create one account', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const college = await newCollege();
  const second = await otherDevice(browser, { baseURL, extraHTTPHeaders });
  try {
    await page.goto(`/ar${college.invitePath}`);
    await second.goto(`/ar${college.invitePath}`);
    const t = ar.auth.invite;
    for (const [tab, name] of [
      [page, 'First Device'],
      [second, 'Second Device'],
    ] as const) {
      await tab.getByLabel(t.name, { exact: true }).fill(name);
      await tab.getByLabel(t.password, { exact: true }).fill('Ab1'.repeat(4));
      await tab.getByRole('checkbox').setChecked(true);
    }

    await Promise.all([
      page.getByRole('button', { name: t.submit }).click(),
      second.getByRole('button', { name: t.submit }).click(),
    ]);

    // Each tab ends either on sign-in (accepted) or with a form error (its code). The checks never wait on
    // an element that may not exist: the accepted tab has no form error at all.
    const outcomes = await Promise.all(
      [page, second].map(async (tab) => {
        let outcome = '';
        await expect(async () => {
          if (tab.url().endsWith('/ar/sign-in?invited=1')) {
            outcome = 'accepted';
            return;
          }
          const error = formError(tab);
          expect(await error.count()).toBe(1);
          outcome = `refused:${(await error.getAttribute('data-code')) ?? ''}`;
        }).toPass({ timeout: 15_000 });
        return outcome;
      }),
    );
    expect(outcomes.sort()).toEqual(['accepted', 'refused:token_invalid']);
    const user = await getUserByEmail(college.adminEmail);
    expect(['First Device', 'Second Device']).toContain(user?.name);
    expect(await countAuditEvents(college.slug, 'invitation.accepted')).toBe(1);
  } finally {
    await second.context().close();
  }
});

test('two colleges never see each other’s names or divisions', async ({
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const collegeA = await newCollege();
  const collegeB = await newCollege();
  const divisionA = {
    code: 'ISO',
    nameAr: `شعبة ${collegeA.slug}`,
    nameEn: `Track ${collegeA.slug}`,
  };
  const divisionB = {
    code: 'ISO',
    nameAr: `شعبة ${collegeB.slug}`,
    nameEn: `Track ${collegeB.slug}`,
  };
  await addDivision(collegeA.tenantId, divisionA);
  await addDivision(collegeB.tenantId, divisionB);

  const pairs = [
    { own: collegeA, ownDivision: divisionA, other: collegeB, otherDivision: divisionB },
    { own: collegeB, ownDivision: divisionB, other: collegeA, otherDivision: divisionA },
  ];
  for (const { own, ownDivision, other, otherDivision } of pairs) {
    const otherTexts = [other.nameAr, other.nameEn, other.slug, otherDivision.nameAr];

    // The administrator's dashboard and shell.
    const adminPage = await otherDevice(browser, { baseURL, extraHTTPHeaders });
    try {
      await onboardAdmin(adminPage, own);
      await expect(adminPage.locator('main')).toContainText(own.nameAr);
      const adminText = await adminPage.locator('body').innerText();
      for (const text of otherTexts) expect(adminText).not.toContain(text);
    } finally {
      await adminPage.context().close();
    }

    // A student's onboarding offers only the own college's divisions.
    const studentPage = await otherDevice(browser, { baseURL, extraHTTPHeaders });
    try {
      const email = await registerConfirmedStudent(studentPage, { college: own.slug });
      await signIn(studentPage, { email });
      await studentPage.waitForURL('/ar/onboarding');
      const divisions = studentPage.getByLabel(ar.onboarding.division, { exact: true });
      await expect(divisions.locator('option', { hasText: ownDivision.nameAr })).toHaveCount(1);
      await expect(divisions.locator('option', { hasText: otherDivision.nameAr })).toHaveCount(0);
      const studentText = await studentPage.locator('body').innerText();
      for (const text of otherTexts) expect(studentText).not.toContain(text);
    } finally {
      await studentPage.context().close();
    }
  }
});

test('suspending a college signs its administrator out; reactivating lets them back in', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const collegeA = await newCollege();
  const collegeB = await newCollege();
  const adminA = await otherDevice(browser, { baseURL, extraHTTPHeaders });
  try {
    await onboardAdmin(adminA, collegeA);
    await onboardAdmin(page, collegeB);

    await setCollegeStatus(collegeB.slug, 'suspended');

    // The next navigation of B's administrator: signed out, with the reason. Suspension deletes no
    // session, which is why the reason is still known.
    await page.goto('/ar/dashboard');
    await expect(page).toHaveURL(/\/ar\/sign-in\?(.*&)?reason=tenant_suspended(&|$)/);
    await expect(page.locator('[data-slot="sign-in-reason"]')).toHaveText(
      ar.errors.tenant_suspended,
    );
    expect(await countSessions(collegeB.adminEmail)).toBeGreaterThan(0);

    await signIn(page, { email: collegeB.adminEmail });
    await expect(formError(page)).toHaveAttribute('data-code', 'tenant_suspended');
    await expect(formError(page)).toContainText(ar.errors.tenant_suspended);

    // College A is unaffected.
    await adminA.goto('/ar/dashboard');
    await expect(adminA).toHaveURL('/ar/dashboard');
    await expect(adminA.locator('main')).toContainText(collegeA.nameAr);

    await setCollegeStatus(collegeB.slug, 'active');
    // A fresh sign-in (the old session would be usable again too).
    await page.context().clearCookies();
    await signIn(page, { email: collegeB.adminEmail });
    await expect(page).toHaveURL('/ar/dashboard');
    await expect(page.locator('main')).toContainText(collegeB.nameAr);
  } finally {
    // Never leave a college suspended, also when an assertion above failed.
    await setCollegeStatus(collegeB.slug, 'active');
    await adminA.context().close();
  }
});

test('the invitation link of a suspended college shows the invalid screen', async ({ page }) => {
  const college = await newCollege();
  await page.goto(`/ar${college.invitePath}`);
  await setCollegeStatus(college.slug, 'suspended');
  try {
    // The form already on screen is refused too, and nothing is created.
    await acceptInvitation(page, { invitePath: college.invitePath, open: false });
    await expect(formError(page)).toHaveAttribute('data-code', 'token_invalid');
    expect(await getUserByEmail(college.adminEmail)).toBeNull();

    await page.goto(`/ar${college.invitePath}`);
    await expectInvalidInvitationScreen(page);
  } finally {
    // Never leave a college suspended, also when an assertion above failed.
    await setCollegeStatus(college.slug, 'active');
  }
  await page.goto(`/ar${college.invitePath}`);
  await expect(page.locator('main form')).toHaveCount(1);
});
