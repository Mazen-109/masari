import { expect, test } from './support/fixtures';
import { registerOnboardedStudent, signIn } from './support/flows';

// Script budget (contracts/ci.md §5, FR-043): the compressed bytes of every JavaScript response a fresh
// visitor downloads, measured through the Chromium DevTools protocol until the network is idle. Public
// screens ≤ 200 KB, signed-in screens ≤ 300 KB. Every batch that adds a budgeted screen appends it here.
// Signed-in screens are measured after signing in, on a fresh page with the browser cache disabled.
const BUDGETS: readonly { path: string; limitKB: number; signedIn?: boolean }[] = [
  { path: '/ar/sign-in', limitKB: 200 },
  { path: '/ar/dashboard', limitKB: 300, signedIn: true },
];

for (const { path, limitKB, signedIn } of BUDGETS) {
  test(`scripts on ${path} stay within ${limitKB} KB`, async ({ page: setupPage }, testInfo) => {
    let page = setupPage;
    if (signedIn === true) {
      const email = await registerOnboardedStudent(setupPage);
      await signIn(setupPage, { email });
      await setupPage.waitForURL('/ar/dashboard');
      page = await setupPage.context().newPage();
    }
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

    expect(scriptRequests.size).toBeGreaterThan(0);
    expect(measuredKB).toBeLessThanOrEqual(limitKB);
  });
}
