import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIpFromHeader, getClientIp } from './request';

const headerValue = vi.hoisted(() => ({ current: null as string | null }));
const env = vi.hoisted(() => ({ TRUSTED_PROXY_HOPS: 0 }));

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(
      new Headers(headerValue.current === null ? {} : { 'x-forwarded-for': headerValue.current }),
    ),
}));
vi.mock('@/server/env', () => ({ getEnv: () => env }));

afterEach(() => {
  headerValue.current = null;
  env.TRUSTED_PROXY_HOPS = 0;
});

// contracts/http-and-env.md §5: hops 0/1/2 × the listed header shapes. 203.0.113.0/24 and 2001:db8::/32 are
// documentation ranges; 198.51.100.7 plays the address a client forges on the left.
const CASES: [string, string | null, number, string | null][] = [
  ['missing header', null, 0, null],
  ['missing header', null, 1, null],
  ['missing header', null, 2, null],
  ['one entry', '203.0.113.5', 0, null],
  ['one entry', '203.0.113.5', 1, '203.0.113.5'],
  ['one entry (too few for 2 hops)', '203.0.113.5', 2, null],
  ['client-forged earlier entry', '198.51.100.7, 203.0.113.5', 0, null],
  ['client-forged earlier entry', '198.51.100.7, 203.0.113.5', 1, '203.0.113.5'],
  ['client-forged earlier entry', '198.51.100.7, 203.0.113.5, 10.0.0.2', 2, '203.0.113.5'],
  ['non-IP entry', '198.51.100.7, unknown', 0, null],
  ['non-IP entry', '198.51.100.7, unknown', 1, null],
  ['non-IP entry', 'unknown, 10.0.0.2', 2, null],
  ['IPv6', '2001:db8::1', 0, null],
  ['IPv6', '2001:db8::1', 1, '2001:db8::1'],
  ['IPv6', '2001:db8::1, 10.0.0.2', 2, '2001:db8::1'],
  ['surrounding spaces', '  203.0.113.5  ', 0, null],
  ['surrounding spaces', '  203.0.113.5  ', 1, '203.0.113.5'],
  ['surrounding spaces', ' 198.51.100.7 ,  203.0.113.5 , 10.0.0.2 ', 2, '203.0.113.5'],
  ['empty trailing entry', '203.0.113.5, ', 1, null],
  ['address with a port', '203.0.113.5:443', 1, null],
];

describe('clientIpFromHeader', () => {
  it.each(CASES)('%s: %j with %i hop(s) → %j', (_name, header, hops, expected) => {
    expect(clientIpFromHeader(header, hops)).toBe(expected);
  });

  it('never returns an entry left of the trusted one, however long the forged chain', () => {
    const forged = Array.from({ length: 10 }, (_, i) => `198.51.100.${i + 1}`).join(', ');
    expect(clientIpFromHeader(`${forged}, 203.0.113.5`, 1)).toBe('203.0.113.5');
  });

  it('treats a non-integer or negative hop count as untrusted', () => {
    expect(clientIpFromHeader('203.0.113.5', 1.5)).toBeNull();
    expect(clientIpFromHeader('203.0.113.5', -1)).toBeNull();
  });
});

describe('getClientIp', () => {
  it('applies TRUSTED_PROXY_HOPS to the request header', async () => {
    headerValue.current = '198.51.100.7, 203.0.113.5';
    env.TRUSTED_PROXY_HOPS = 1;
    await expect(getClientIp()).resolves.toBe('203.0.113.5');
  });

  it('ignores the header when no proxy is trusted', async () => {
    headerValue.current = '203.0.113.5';
    await expect(getClientIp()).resolves.toBeNull();
  });
});
