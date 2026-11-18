import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { bypassesLocaleRouting } from '@/lib/locale';
import { contentSecurityPolicy, createNonce, CSP_HEADER } from '@/lib/security-headers';
import { isDevServer } from '@/server/env';

// Locale routing and the page CSP only — no authorisation here (contracts/routes.md §5, constitution).
const handleI18nRouting = createMiddleware(routing);

/** Files (`/robots.txt`, `/favicon.ico`, …) are never locale-prefixed. */
function isFilePath(pathname: string): boolean {
  return pathname.includes('.');
}

/**
 * Every request the matcher lets through gets a Content-Security-Policy with a fresh script nonce
 * (contracts/http-and-env.md §2; Next.js 16 guide "Content Security Policy"). The policy is set on the
 * request too: Next.js reads the nonce from the request's CSP header while rendering and adds it to its own
 * scripts. That only works for pages rendered per request, so `[locale]/layout.tsx` and `not-found.tsx`
 * opt into dynamic rendering.
 */
export default function proxy(request: NextRequest) {
  const policy = contentSecurityPolicy({ nonce: createNonce(), dev: isDevServer() });
  // next-intl copies `request.headers` into the request it forwards; the pass-through does the same.
  request.headers.set(CSP_HEADER, policy);

  // Unknown locale (`/fr`, `/AR`, …): let `[locale]/layout.tsx` answer 404. See `bypassesLocaleRouting`
  // for the 2–3-letter top-level path caveat. Files skip locale routing.
  const { pathname } = request.nextUrl;
  const response =
    bypassesLocaleRouting(pathname) || isFilePath(pathname)
      ? NextResponse.next({ request: { headers: request.headers } })
      : handleI18nRouting(request);
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export const config = {
  // Everything except API routes and Next.js internals: those get the nonce-less CSP from next.config.ts
  // (`PROXY_FREE_PATHS` in lib/security-headers.ts must stay the complement of this pattern). Paths with a
  // dot pass through without locale routing, so every page calls `setRequestLocale` instead of relying
  // on the proxy header.
  matcher: ['/((?!api/|_next/|_vercel/).*)'],
};
