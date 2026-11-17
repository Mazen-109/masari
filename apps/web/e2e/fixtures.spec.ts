import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { clientAddressFor, expect, isBenchmarkAddress, test } from './support/fixtures';

// The per-test client address of e2e/support/fixtures.ts (contracts/http-and-env.md §5). A local echo
// server (loopback, ephemeral port) shows exactly which `x-forwarded-for` header arrives.

let echo: Server;
let echoUrl: string;

test.beforeAll(async () => {
  echo = createServer((request, response) => {
    response.setHeader('content-type', 'text/plain');
    response.end(request.headers['x-forwarded-for'] ?? '');
  });
  await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
  echoUrl = `http://127.0.0.1:${(echo.address() as AddressInfo).port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    echo.close((error) => (error ? reject(error) : resolve())),
  );
});

test('the browser sends this test’s own address inside 198.18.0.0/15', async ({
  page,
}, testInfo) => {
  const expected = clientAddressFor(testInfo.project.name, testInfo.testId, testInfo.retry);
  await page.goto(echoUrl);

  expect(await page.locator('body').innerText()).toBe(expected);
  expect(isBenchmarkAddress(expected)).toBe(true);
});

test('the API request context sends the same address', async ({ request }, testInfo) => {
  const expected = clientAddressFor(testInfo.project.name, testInfo.testId, testInfo.retry);
  const response = await request.get(echoUrl);

  expect(await response.text()).toBe(expected);
});

test('different tests and retries get different addresses, all inside the range', () => {
  const first = clientAddressFor('desktop', 'test-a', 0);
  const second = clientAddressFor('desktop', 'test-b', 0);
  const retried = clientAddressFor('desktop', 'test-a', 1);
  const otherProject = clientAddressFor('mobile', 'test-a', 0);
  const all = [first, second, retried, otherProject];

  expect(new Set(all).size).toBe(all.length);
  for (const address of all) {
    expect(isBenchmarkAddress(address)).toBe(true);
  }
  expect(clientAddressFor('desktop', 'test-a', 0)).toBe(first);
  expect(isBenchmarkAddress('198.19.255.255')).toBe(true);
  expect(isBenchmarkAddress('198.20.0.1')).toBe(false);
  expect(isBenchmarkAddress('198.17.255.255')).toBe(false);
});
