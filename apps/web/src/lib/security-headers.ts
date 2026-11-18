/**
 * Browser protections (contracts/http-and-env.md §2; FR-048, FR-049). Pure values shared by
 * `next.config.ts` (static headers on every response; the CSP of API routes and `/_next/*` assets) and
 * `src/proxy.ts` (the per-request CSP of every page, with a fresh script nonce). Imported by
 * `next.config.ts` through a relative path, so this file has no imports.
 */

export const CSP_HEADER = 'Content-Security-Policy';

/** One response header, in the shape of `next.config.ts` `headers()`. */
export type HeaderEntry = Readonly<{ key: string; value: string }>;

export type CspOptions = Readonly<{
  /**
   * The request's script nonce (pages only). With a nonce, scripts run only when they carry it or are
   * loaded by one that does (`'strict-dynamic'`); Next.js adds it to its own scripts during rendering.
   * Without one (API responses, static assets) only same-origin script files are allowed.
   */
  nonce?: string;
  /** `next dev` only: React needs `eval` for its debugging stacks and the dev server a WebSocket. */
  dev: boolean;
}>;

/**
 * The Content-Security-Policy value. Scripts never get `'unsafe-inline'`. Styles keep it: React and the
 * UI primitives set `style` attributes, and a style nonce would switch `'unsafe-inline'` off.
 */
export function contentSecurityPolicy({ nonce, dev }: CspOptions): string {
  const scriptSrc = ["'self'"];
  if (nonce !== undefined) scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  if (dev) scriptSrc.push("'unsafe-eval'");
  const connectSrc = dev ? ["'self'", 'ws:'] : ["'self'"];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** HSTS: two years, sub-domains included; sent only when the app is served over https. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains';

/** The headers every response carries besides the CSP. `https`: `APP_URL` starts with `https://`. */
export function securityHeaders({ https }: Readonly<{ https: boolean }>): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ];
  if (https) headers.push({ key: 'Strict-Transport-Security', value: STRICT_TRANSPORT_SECURITY });
  return headers;
}

/**
 * Paths `src/proxy.ts` does not run on; `next.config.ts` gives them the nonce-less CSP. The proxy matcher
 * is the complement, so a response never carries two CSP headers (a browser would enforce both).
 */
export const PROXY_FREE_PATHS = ['/api/:path+', '/_next/:path+', '/_vercel/:path+'] as const;

/** Bytes of randomness in a nonce (128 bits). */
const NONCE_BYTES = 16;

/** A fresh, unguessable nonce for one response: 16 random bytes, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}
