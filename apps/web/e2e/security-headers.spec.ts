import type { APIResponse, Page, Response } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  CATALOGS,
  registerConfirmedStudent,
  signInAsDemoAdmin,
  TEST_PASSWORD,
} from './support/flows';
import {
  localized,
  PUBLIC_SCREENS,
  SCREEN_LOCALES,
  SIGNED_IN_SCREENS,
  SIGNED_IN_TEST_TIMEOUT_MS,
  signInAs,
} from './support/screens';

// Browser protections (contracts/http-and-env.md §2; FR-048, FR-049). The values are written out here, not
// imported from src/lib/security-headers.ts, so a change there must be made deliberately in both places.
// The e2e server runs a production build over http: no development additions, no HSTS.

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; " +
  "base-uri 'self'; form-action 'self'; object-src 'none'";

const EXPECTED_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow',
} as const;

type AnyResponse = Response | APIResponse;

/** All values of one header (each must be sent exactly once). */
async function headerValues(response: AnyResponse, name: string): Promise<string[]> {
  const all = 'allHeaders' in response ? await response.headersArray() : response.headersArray();
  return all.filter((header) => header.name.toLowerCase() === name).map((header) => header.value);
}

/** Asserts every header with its exact value, once; no HSTS (http); no X-Powered-By. */
async function expectProtections(response: AnyResponse | null): Promise<void> {
  if (response === null) throw new Error('no response');
  for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
    expect(await headerValues(response, name), name).toEqual([value]);
  }
  expect(await headerValues(response, 'x-powered-by')).toEqual([]);
  expect(await headerValues(response, 'strict-transport-security')).toEqual([]);
}

test('a public page and its static script files send every protection', async ({ request }) => {
  const response = await request.get('/ar/sign-in');
  expect(response.status()).toBe(200);
  await expectProtections(response);

  const asset = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/.exec(
    await response.text(),
  )?.[1];
  if (asset === undefined) throw new Error('the sign-in page loads no script file');
  const assetResponse = await request.get(asset);
  expect(assetResponse.status()).toBe(200);
  await expectProtections(assetResponse);
});

test('a signed-in page sends every protection', async ({ page }) => {
  await signInAsDemoAdmin(page);
  const response = await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/dashboard');
  await expectProtections(response);
});

test('/api/health sends every protection', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  await expectProtections(response);
});

test('/robots.txt disallows every crawler on every path', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
  const lines = (await response.text())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  expect(lines).toEqual(['User-Agent: *', 'Disallow: /']);
  await expectProtections(response);
});

// ---------------------------------------------------------------------------------------------------
// No screen trips the CSP.

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

/** Records every CSP violation the page reports: `securitypolicyviolation` events and console errors. */
async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations?.push(
        `${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} at ${event.sourceFile}`,
      );
    });
  });
  return violations;
}

/** Opens a screen, waits until its scripts ran (Next.js started), and asserts no CSP violation. */
async function expectNoCspViolation(page: Page, path: string, consoleViolations: string[]) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // `window.next` is set by the Next.js client runtime: the page's scripts were allowed to run.
  await expect
    .poll(() => page.evaluate(() => typeof (window as { next?: unknown }).next))
    .toBe('object');
  const reported = await page.evaluate(() => window.__cspViolations ?? []);
  expect([...reported, ...consoleViolations], path).toEqual([]);
}

test('no CSP violation on any public screen, or on the not-found screens', async ({ page }) => {
  test.setTimeout(120_000);
  const consoleViolations = await watchCsp(page);
  // The 404 checks (the localized `/no-such-screen` in PUBLIC_SCREENS, and `/fr`, `/no-such-file.txt`
  // below) depend on `window.next` being loaded: expectNoCspViolation polls for it to prove the page's
  // scripts were allowed to run. If a not-found page ever stops loading the Next.js client runtime, the
  // poll times out; then make the check wait for something else that page runs — never drop the check.
  for (const locale of SCREEN_LOCALES) {
    for (const path of [...PUBLIC_SCREENS, '/']) {
      await expectNoCspViolation(page, localized(locale, path), consoleViolations);
    }
  }
  // Paths without a valid locale (the bilingual fallback 404 page).
  for (const path of ['/fr', '/no-such-file.txt']) {
    await expectNoCspViolation(page, path, consoleViolations);
  }
});

const SIGNED_IN_ROLES = [...new Set(SIGNED_IN_SCREENS.flatMap(({ roles }) => roles))];

for (const role of SIGNED_IN_ROLES) {
  test(`no CSP violation on any signed-in screen as ${role}`, async ({ page }) => {
    test.setTimeout(SIGNED_IN_TEST_TIMEOUT_MS);
    const consoleViolations = await watchCsp(page);
    await signInAs(page, role);
    for (const locale of SCREEN_LOCALES) {
      for (const { path } of SIGNED_IN_SCREENS.filter(({ roles }) => roles.includes(role))) {
        await expectNoCspViolation(page, localized(locale, path), consoleViolations);
        await expect(page).toHaveURL(localized(locale, path));
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------------
// Server Actions accept only same-origin requests (framework default, contracts/http-and-env.md §2).

const FOREIGN_ORIGIN = 'http://attacker.test';

test('a cross-origin form post to a Server Action is rejected and signs nobody in', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const t = CATALOGS.ar.auth.signIn;
  const email = await registerConfirmedStudent(page);
  await page.context().clearCookies();

  // The sign-in form as the server renders it for a browser without JavaScript: a plain multipart POST
  // carrying the action's hidden fields — what a page on another site can copy and submit.
  const plainContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders,
    javaScriptEnabled: false,
  });
  const plain = await plainContext.newPage();
  await plain.goto('/ar/sign-in');
  const formHtml = await plain.locator('main form').evaluate((form) => form.outerHTML);

  // Another site serves that form, pointed at the real sign-in screen, and submits valid credentials.
  const target = new URL('/ar/sign-in', baseURL).toString();
  await page.route(`${FOREIGN_ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="ar" dir="rtl"><body>${formHtml}</body></html>`,
    }),
  );
  await page.goto(`${FOREIGN_ORIGIN}/`);
  const form = page.locator('form');
  await form.evaluate((element, action) => element.setAttribute('action', action), target);
  await form.getByLabel(t.email, { exact: true }).fill(email);
  await form.getByLabel(t.password, { exact: true }).fill(TEST_PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.request().method() === 'POST' && candidate.url() === target,
    ),
    form.getByRole('button', { name: t.submit, exact: true }).click(),
  ]);
  expect((await response.request().allHeaders())['origin']).toBe(FOREIGN_ORIGIN);
  expect(response.status()).toBeGreaterThanOrEqual(400);
  // The rejected answer sets no cookie (no session, nothing else).
  expect(await response.headerValues('set-cookie')).toEqual([]);
  expect(await page.context().cookies(baseURL)).toEqual([]);

  // Nobody was signed in: the browser has no session for the app.
  await page.goto('/ar/dashboard');
  await expect(page).toHaveURL(/\/ar\/sign-in/);

  // The same form, submitted from the app's own origin, signs in: the origin alone made the difference.
  await plain.getByLabel(t.email, { exact: true }).fill(email);
  await plain.getByLabel(t.password, { exact: true }).fill(TEST_PASSWORD);
  await plain.getByRole('button', { name: t.submit, exact: true }).click();
  // A student without an academic profile lands on onboarding.
  await plain.waitForURL('/ar/onboarding');
  await plainContext.close();
});
