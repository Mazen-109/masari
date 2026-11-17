import { createHash } from 'node:crypto';
import { test as base } from '@playwright/test';

// The `test` object every spec imports (contracts/http-and-env.md §5). The e2e server trusts one proxy
// hop and no proxy runs in front of it, so the `x-forwarded-for` header sent by the test is the client
// address the server sees — the production code path. Each test gets its own address inside
// 198.18.0.0/15 (reserved for benchmarking, never a real client), derived from the project, the test id,
// and the retry number: every test has its own per-IP rate-limit buckets, and a retry starts fresh.
// The header is set for the browser context and for the `request` (API) context of the test.

/** 198.18.0.0/15 holds 2^17 addresses. */
const RANGE_SIZE = 2 ** 17;
const RANGE_START = ((198 << 24) | (18 << 16)) >>> 0;

export function clientAddressFor(projectName: string, testId: string, retry: number): string {
  const digest = createHash('sha256').update(`${projectName}\n${testId}\n${retry}`).digest();
  const value = RANGE_START + (digest.readUInt32BE(0) % RANGE_SIZE);
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

/** True for a dotted IPv4 address inside 198.18.0.0/15. */
export function isBenchmarkAddress(address: string): boolean {
  const parts = address.split('.').map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return (
    parts.length === 4 &&
    parts.every((part) => part >= 0 && part <= 255) &&
    parts[0] === 198 &&
    (parts[1] === 18 || parts[1] === 19)
  );
}

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({
      ...extraHTTPHeaders,
      'x-forwarded-for': clientAddressFor(testInfo.project.name, testInfo.testId, testInfo.retry),
    });
  },
});

export { expect } from '@playwright/test';
