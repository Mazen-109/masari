import { expect, test } from './support/fixtures';

// Script budget (contracts/ci.md §5, FR-043): the compressed bytes of every JavaScript response a fresh
// visitor downloads, measured through the Chromium DevTools protocol until the network is idle. Public
// screens ≤ 200 KB, signed-in screens ≤ 300 KB. Every batch that adds a budgeted screen appends it here.
const BUDGETS: readonly { path: string; limitKB: number }[] = [{ path: '/ar', limitKB: 200 }];

for (const { path, limitKB } of BUDGETS) {
  test(`scripts on ${path} stay within ${limitKB} KB`, async ({ page }, testInfo) => {
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

    const measuredKB = Math.round((bytes / 1024) * 10) / 10;
    const summary = `${path}: ${measuredKB} KB of scripts in ${scriptRequests.size} files (limit ${limitKB} KB)`;
    console.log(`[script budget] ${summary}`);
    testInfo.annotations.push({ type: 'script-budget', description: summary });

    expect(scriptRequests.size).toBeGreaterThan(0);
    expect(measuredKB).toBeLessThanOrEqual(limitKB);
  });
}
