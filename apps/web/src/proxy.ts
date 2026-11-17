import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { isLocale } from '@/lib/locale';

// Locale routing only — no authorisation here (contracts/routes.md §5, constitution).
const handleI18nRouting = createMiddleware(routing);

// A first path segment shaped like a language tag (`fr`, `de-AT`, `zh-Hant`). When it is not one of
// our locales the request is passed through untouched so that `[locale]/layout.tsx` answers 404,
// instead of next-intl prefixing it with the default locale (`/fr` → `/ar/fr`).
const LOCALE_LIKE_SEGMENT = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

export default function proxy(request: NextRequest) {
  const firstSegment = request.nextUrl.pathname.split('/')[1] ?? '';
  if (LOCALE_LIKE_SEGMENT.test(firstSegment) && !isLocale(firstSegment)) {
    return NextResponse.next();
  }
  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes, Next.js internals, and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
