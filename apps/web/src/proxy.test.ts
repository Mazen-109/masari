import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy, { config } from './proxy';

// src/proxy.ts: locale routing plus the per-request page CSP (contracts/http-and-env.md §2). The headers
// the running server sends are checked end to end in e2e/security-headers.spec.ts.

const SCRIPT_SRC = /script-src 'self' 'nonce-([A-Za-z0-9+/]{22}==)' 'strict-dynamic'; /;

function call(path: string) {
  return proxy(new NextRequest(new URL(path, 'http://localhost:3000')));
}

/** The CSP of the response, and the CSP the proxy forwards to the renderer as a request header. */
function policies(response: Response) {
  return {
    sent: response.headers.get('content-security-policy'),
    forwarded: response.headers.get('x-middleware-request-content-security-policy'),
    overridden: (response.headers.get('x-middleware-override-headers') ?? '').split(','),
  };
}

describe('proxy', () => {
  it('sends a nonce CSP on a page and forwards the same policy to the renderer', () => {
    const response = call('/ar/sign-in');
    const { sent, forwarded, overridden } = policies(response);
    expect(sent).toMatch(SCRIPT_SRC);
    const scriptSrc = sent?.split('; ').find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(sent).not.toContain('unsafe-eval');
    expect(forwarded).toBe(sent);
    expect(overridden).toContain('content-security-policy');
  });

  it('uses a different nonce for every request', () => {
    const first = SCRIPT_SRC.exec(policies(call('/ar/sign-in')).sent ?? '')?.[1];
    const second = SCRIPT_SRC.exec(policies(call('/ar/sign-in')).sent ?? '')?.[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it('keeps locale routing: an unprefixed path is redirected, with the CSP', () => {
    const response = call('/sign-in');
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/ar/sign-in');
    expect(policies(response).sent).toMatch(SCRIPT_SRC);
  });

  it.each(['/robots.txt', '/favicon.ico', '/fr', '/AR/sign-in'])(
    'passes %s through without locale routing, with the CSP',
    (path) => {
      const response = call(path);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
      expect(response.headers.get('location')).toBeNull();
      const { sent, forwarded } = policies(response);
      expect(sent).toMatch(SCRIPT_SRC);
      expect(forwarded).toBe(sent);
    },
  );
});

describe('proxy matcher', () => {
  const [pattern] = config.matcher;
  const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

  it('runs on pages and files, never on API routes or Next.js assets', () => {
    for (const path of ['/', '/ar', '/ar/sign-in', '/robots.txt', '/api', '/apiary']) {
      expect(matches(path), path).toBe(true);
    }
    for (const path of ['/api/health', '/api/auth/x', '/_next/static/chunks/a.js', '/_vercel/x']) {
      expect(matches(path), path).toBe(false);
    }
  });
});
