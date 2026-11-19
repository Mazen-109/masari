import { expect, test } from './support/fixtures';
import { signIn, signInAsDemoAdmin } from './support/flows';
import { registerStudentWithProfile } from './support/students';

// Script budget (contracts/ci.md §5, FR-043): the compressed bytes of every JavaScript response a fresh
// visitor downloads, measured through the Chromium DevTools protocol until the network is idle — this
// includes the menus the signed-in shell preloads once the page is idle. The limits are the sizes measured
// after PR-40 plus a small margin; lower them when a batch makes a screen lighter, never raise them.
// Every batch that adds a budgeted screen appends it here. Signed-in screens are measured after signing
// in, on a fresh page with the browser cache disabled. `signedIn` names who is signed in: a new student,
// or the demo college's administrator.
const BUDGETS: readonly { path: string; limitKB: number; signedIn?: 'student' | 'admin' }[] = [
  { path: '/ar/sign-in', limitKB: 170 },
  { path: '/en/sign-in', limitKB: 170 },
  { path: '/ar/register', limitKB: 180 },
  { path: '/ar/dashboard', limitKB: 210, signedIn: 'student' },
  { path: '/ar/admin/users', limitKB: 230, signedIn: 'admin' },
];

// Font budget (PR-39, research.md §17): the same load may fetch at most the four IBM Plex Sans Arabic
// files of fonts.ts — Arabic and Latin, weights 400 and 700 — about 126 KB together; an Arabic screen
// usually needs fewer, and `/en/sign-in` checks that an English screen stays within it too. A new weight, subset, or font file fails here. Only the Arabic 400 file is preloaded.
const FONT_BUDGET = { files: 4, limitKB: 130 } as const;
const PLEX_FILE =
  /\/_next\/static\/media\/ibm_plex_sans_arabic_(arabic|latin)_(400|700)_normal\.[^/]*woff2$/;
const PRELOADED_FONT = /ibm_plex_sans_arabic_arabic_400_normal\.[^/]*woff2$/;

/** A `layout-shift` performance entry (not in TypeScript's DOM library). */
type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean };

/** Runs in the page: the last largest-contentful-paint time and the layout shifts not caused by input. */
function paintAndShifts(): Promise<{ lcp: number; cls: number }> {
  return new Promise((resolve) => {
    let lcp = 0;
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    // Buffered entries are delivered in a later task.
    setTimeout(() => resolve({ lcp, cls }), 250);
  });
}

for (const { path, limitKB, signedIn } of BUDGETS) {
  test(`scripts on ${path} stay within ${limitKB} KB and fonts within budget`, async ({
    page: setupPage,
  }, testInfo) => {
    let page = setupPage;
    if (signedIn === 'student') {
      const email = await registerStudentWithProfile(setupPage);
      await signIn(setupPage, { email });
      await setupPage.waitForURL('/ar/dashboard');
    } else if (signedIn === 'admin') {
      await signInAsDemoAdmin(setupPage);
    }
    if (signedIn !== undefined) page = await setupPage.context().newPage();
    const cdp = await page.context().newCDPSession(page);
    const scriptRequests = new Set<string>();
    const fontUrls = new Map<string, string>();
    let bytes = 0;
    let fontBytes = 0;
    cdp.on('Network.responseReceived', (event) => {
      if (event.type === 'Script') scriptRequests.add(event.requestId);
      if (event.type === 'Font') fontUrls.set(event.requestId, event.response.url);
    });
    cdp.on('Network.loadingFinished', (event) => {
      if (scriptRequests.has(event.requestId)) bytes += event.encodedDataLength;
      if (fontUrls.has(event.requestId)) fontBytes += event.encodedDataLength;
    });
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    await page.goto(path, { waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).toBe(path);

    const measuredKB = Math.round((bytes / 1024) * 10) / 10;
    const summary = `${path}: ${measuredKB} KB of scripts in ${scriptRequests.size} files (limit ${limitKB} KB)`;
    console.log(`[script budget] ${summary}`);
    testInfo.annotations.push({ type: 'script-budget', description: summary });

    // Recorded, not asserted: LCP and CLS of this load on the unthrottled local machine. They are no
    // substitute for the throttled Lighthouse run of T146 (FR-043), only a reference when it cannot run.
    const vitals = await page.evaluate(paintAndShifts);
    const timings = `${path}: LCP ${Math.round(vitals.lcp)} ms, CLS ${vitals.cls.toFixed(3)} (unthrottled)`;
    console.log(`[web vitals] ${timings}`);
    testInfo.annotations.push({ type: 'web-vitals', description: timings });

    const fontKB = Math.round((fontBytes / 1024) * 10) / 10;
    const fonts = `${path}: ${fontKB} KB of fonts in ${fontUrls.size} files (limit ${FONT_BUDGET.limitKB} KB, ${FONT_BUDGET.files} files)`;
    console.log(`[font budget] ${fonts}`);
    testInfo.annotations.push({ type: 'font-budget', description: fonts });
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));

    expect(scriptRequests.size).toBeGreaterThan(0);
    expect(measuredKB).toBeLessThanOrEqual(limitKB);
    for (const url of fontUrls.values()) expect(url).toMatch(PLEX_FILE);
    expect(fontUrls.size).toBeGreaterThan(0);
    expect(fontUrls.size).toBeLessThanOrEqual(FONT_BUDGET.files);
    expect(fontKB).toBeLessThanOrEqual(FONT_BUDGET.limitKB);
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toMatch(PRELOADED_FONT);
  });
}
