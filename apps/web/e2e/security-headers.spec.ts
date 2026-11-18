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
  signInAs,
} from './support/screens';

// Browser protections (contracts/http-and-env.md §2; FR-048, FR-049). The values are written out here, not
// imported from src/lib/security-headers.ts, so a change there must be made deliberately in both places.

/** The page CSP; the nonce (16 bytes, base64) is captured. Scripts never get 'unsafe-inline'. */
const PAGE_CSP = new RegExp(
  '^' +
    [
      "default-src 'self'",
      "script-src 'self' 'nonce-([A-Za-z0-9+/]{22}==)' 'strict-dynamic'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]
      .join('; ')
      .replaceAll('+', '\\+') +
    '$',
);

/** The CSP of everything the proxy does not render (API routes, static assets): no nonce. */
const ASSET_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; " +
  "base-uri 'self'; form-action 'self'; object-src 'none'";

const FIXED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow',
} as const;

type AnyResponse = Response | APIResponse;

/** All values of one header (a response must not carry two CSPs: a browser would enforce both). */
async function headerValues(response: AnyResponse, name: string): Promise<string[]> {
  const all = 'allHeaders' in response ? await response.headersArray() : response.headersArray();
  return all.filter((header) => header.name.toLowerCase() === name).map((header) => header.value);
}

/** Asserts every fixed header, exactly one CSP, no HSTS (the e2e server runs on http), no X-Powered-By. */
async function expectProtections(response: AnyResponse): Promise<string> {
  for (const [name, value] of Object.entries(FIXED_HEADERS)) {
    expect(await headerValues(response, name), name).toEqual([value]);
  }
  expect(await headerValues(response, 'x-powered-by')).toEqual([]);
  expect(await headerValues(response, 'strict-transport-security')).toEqual([]);
  const csp = await headerValues(response, 'content-security-policy');
  expect(csp).toHaveLength(1);
  return csp[0] ?? '';
}

/** Checks a page response's headers and returns its script nonce. */
async function expectPageProtections(response: AnyResponse | null): Promise<string> {
  if (response === null) throw new Error('no response');
  const csp = await expectProtections(response);
  expect(csp).toMatch(PAGE_CSP);
  return PAGE_CSP.exec(csp)?.[1] ?? '';
}

test('a public page sends every protection and a fresh script nonce that its scripts carry', async ({
  request,
}) => {
  const first = await request.get('/ar/sign-in');
  expect(first.status()).toBe(200);
  const nonce = await expectPageProtections(first);
  const html = await first.text();
  // Next.js adds the nonce to its own scripts while rendering (none may be left without it).
  expect(html).toContain(`nonce="${nonce}"`);
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);

  const second = await request.get('/ar/sign-in');
  expect(await expectPageProtections(second)).not.toBe(nonce);

  // A static asset of the page: the protections and the nonce-less CSP.
  const asset = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/.exec(html)?.[1];
  if (asset === undefined) throw new Error('the sign-in page loads no script file');
  const assetResponse = await request.get(asset);
  expect(assetResponse.status()).toBe(200);
  expect(await expectProtections(assetResponse)).toBe(ASSET_CSP);
});

test('a signed-in page sends every protection', async ({ page }) => {
  await signInAsDemoAdmin(page);
  const response = await page.goto('/ar/dashboard');
  await expect(page).toHaveURL('/ar/dashboard');
  await expectPageProtections(response);
});

test('/api/health sends every protection and the nonce-less CSP', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await expectProtections(response)).toBe(ASSET_CSP);
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
  await expectPageProtections(response);
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
  for (const locale of SCREEN_LOCALES) {
    for (const path of [...PUBLIC_SCREENS, '/', '/no-such-screen']) {
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
    test.setTimeout(120_000);
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
