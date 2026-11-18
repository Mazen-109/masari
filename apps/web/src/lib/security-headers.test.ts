import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  securityHeaders,
  STRICT_TRANSPORT_SECURITY,
} from './security-headers';

// contracts/http-and-env.md §2 (FR-048, FR-049). The e2e suite (e2e/security-headers.spec.ts) checks the
// headers the server actually sends.

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; " +
  "base-uri 'self'; form-action 'self'; object-src 'none'";

const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
  "connect-src 'self' ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; " +
  "object-src 'none'";

const FIXED = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

describe('contentSecurityPolicy', () => {
  it('is exactly the contract value outside the development server', () => {
    expect(contentSecurityPolicy({ dev: false })).toBe(CSP);
  });

  it("adds 'unsafe-eval' and ws: only for the development server", () => {
    expect(contentSecurityPolicy({ dev: true })).toBe(DEV_CSP);
    expect(CSP).not.toContain('unsafe-eval');
    expect(CSP).not.toContain('ws:');
  });
});

describe('securityHeaders', () => {
  it('sends the CSP and the fixed headers, without HSTS over http', () => {
    expect(securityHeaders({ dev: false, https: false })).toEqual([
      { key: 'Content-Security-Policy', value: CSP },
      ...FIXED,
    ]);
  });

  it('adds HSTS over https', () => {
    expect(securityHeaders({ dev: false, https: true })).toEqual([
      { key: 'Content-Security-Policy', value: CSP },
      ...FIXED,
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]);
    expect(STRICT_TRANSPORT_SECURITY).toBe('max-age=63072000; includeSubDomains');
  });

  it('uses the development CSP under next dev', () => {
    expect(securityHeaders({ dev: true, https: false })[0]).toEqual({
      key: 'Content-Security-Policy',
      value: DEV_CSP,
    });
  });
});
