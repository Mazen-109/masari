import { expect, test } from './support/fixtures';
import { signIn, signInAsDemoAdmin } from './support/flows';
import { registerStudentWithProfile } from './support/students';

// Script budget (contracts/ci.md §5, FR-043): the compressed bytes of every JavaScript response a fresh
// visitor downloads, measured through the Chromium DevTools protocol until the network is idle. Public
// screens ≤ 200 KB, signed-in screens ≤ 300 KB. Every batch that adds a budgeted screen appends it here.
// Signed-in screens are measured after signing in, on a fresh page with the browser cache disabled.
// `signedIn` names who is signed in: a new student, or the demo college's administrator.
const BUDGETS: readonly { path: string; limitKB: number; signedIn?: 'student' | 'admin' }[] = [
  { path: '/ar/sign-in', limitKB: 200 },
  { path: '/ar/register', limitKB: 200 },
  { path: '/ar/dashboard', limitKB: 300, signedIn: 'student' },
  { path: '/ar/admin/users', limitKB: 300, signedIn: 'admin' },
];

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
  test(`scripts on ${path} stay within ${limitKB} KB`, async ({ page: setupPage }, testInfo) => {
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
    let bytes = 0;
    cdp.on('Network.responseReceived', (event) => {
      if (event.type === 'Script') scriptRequests.add(event.requestId);
    });
    cdp.on('Network.loadingFinished', (event) => {
      if (scriptRequests.has(event.requestId)) bytes += event.encodedDataLength;
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

    expect(scriptRequests.size).toBeGreaterThan(0);
    expect(measuredKB).toBeLessThanOrEqual(limitKB);
  });
}
