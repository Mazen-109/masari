import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  createNonce,
  PROXY_FREE_PATHS,
  securityHeaders,
  STRICT_TRANSPORT_SECURITY,
} from './security-headers';

// contracts/http-and-env.md §2 (FR-048, FR-049). The e2e suite (e2e/security-headers.spec.ts) checks the
// headers the server actually sends.

const NONCE = 'Tk9'.repeat(8);

describe('contentSecurityPolicy', () => {
  it('allows page scripts only by nonce (never unsafe-inline) in production', () => {
    expect(contentSecurityPolicy({ nonce: NONCE, dev: false })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; ` +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; " +
        "object-src 'none'",
    );
  });

  it('allows only same-origin script files when there is no nonce', () => {
    const policy = contentSecurityPolicy({ dev: false });
    expect(policy).toContain("script-src 'self'; ");
    expect(policy).not.toContain('nonce-');
    expect(policy).not.toContain('strict-dynamic');
  });

  it('adds unsafe-eval and ws: only for the development server', () => {
    const dev = contentSecurityPolicy({ nonce: NONCE, dev: true });
    expect(dev).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval'; `);
    expect(dev).toContain("connect-src 'self' ws:; ");
    for (const policy of [
      contentSecurityPolicy({ nonce: NONCE, dev: false }),
      contentSecurityPolicy({ dev: false }),
    ]) {
      expect(policy).not.toContain('unsafe-eval');
      expect(policy).not.toContain('ws:');
    }
  });

  it('never allows inline scripts', () => {
    for (const nonce of [NONCE, undefined]) {
      for (const dev of [true, false]) {
        const scriptSrc = contentSecurityPolicy({ nonce, dev })
          .split('; ')
          .find((directive) => directive.startsWith('script-src '));
        expect(scriptSrc).toBeDefined();
        expect(scriptSrc).not.toContain('unsafe-inline');
      }
    }
  });
});

describe('securityHeaders', () => {
  it('sends the fixed headers, and HSTS only over https', () => {
    const fixed = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];
    expect(securityHeaders({ https: false })).toEqual(fixed);
    expect(securityHeaders({ https: true })).toEqual([
      ...fixed,
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]);
    expect(STRICT_TRANSPORT_SECURITY).toBe('max-age=63072000; includeSubDomains');
  });
});

describe('PROXY_FREE_PATHS', () => {
  it('lists the API, Next.js assets, and platform paths the proxy matcher skips', () => {
    expect(PROXY_FREE_PATHS).toEqual(['/api/:path+', '/_next/:path+', '/_vercel/:path+']);
  });
});

describe('createNonce', () => {
  it('returns 16 random bytes in base64, different every time', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(atob(nonce)).toHaveLength(16);
    }
  });
});
