/**
 * Browser protections (contracts/http-and-env.md §2; FR-048, FR-049): the response headers every path
 * gets from `next.config.ts`. Imported by `next.config.ts` through a relative path, so this file has no
 * imports.
 */

/** One response header, in the shape of `next.config.ts` `headers()`. */
export type HeaderEntry = Readonly<{ key: string; value: string }>;

export type SecurityHeaderOptions = Readonly<{
  /** `next dev`: React needs `eval` for its debugging stacks and the dev server a WebSocket. */
  dev: boolean;
  /** `APP_URL` starts with `https://`: send HSTS. */
  https: boolean;
}>;

/** The Content-Security-Policy value of contracts/http-and-env.md §2. */
export function contentSecurityPolicy({ dev }: Pick<SecurityHeaderOptions, 'dev'>): string {
  const scriptSrc = dev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const connectSrc = dev ? "'self' ws:" : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** HSTS: two years, sub-domains included; sent only when the app is served over https. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains';

/** Every header of contracts/http-and-env.md §2, in table order. */
export function securityHeaders({ dev, https }: SecurityHeaderOptions): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy({ dev }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ];
  if (https) headers.push({ key: 'Strict-Transport-Security', value: STRICT_TRANSPORT_SECURITY });
  return headers;
}
