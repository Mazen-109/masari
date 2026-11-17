import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { bypassesLocaleRouting } from '@/lib/locale';

// Locale routing only — no authorisation here (contracts/routes.md §5, constitution).
const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  // Unknown locale (`/fr`, `/AR`, …): let `[locale]/layout.tsx` answer 404. See `bypassesLocaleRouting`
  // for the 2–3-letter top-level path caveat.
  if (bypassesLocaleRouting(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes, Next.js internals, and files with an extension. Paths with a dot
  // skip the proxy, so every page calls `setRequestLocale` instead of relying on the proxy header.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
