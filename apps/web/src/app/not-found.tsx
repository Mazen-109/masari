import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator } from 'next-intl';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { FALLBACK_NOT_FOUND_TITLE } from '@/lib/fallback-text';
import './globals.css';

// Fallback 404 for paths without a valid locale (e.g. `/fr`). The language is unknown here, so the
// page is bilingual: Arabic first (document language), then English. The title is rendered as a
// `<title>` element (React hoists it into `<head>`) rather than through `metadata`: when
// `[locale]/layout.tsx` itself calls `notFound()` (`/fr`), Next.js emits no metadata title for this
// boundary, and the page would have an empty title (caught by e2e/locale.spec.ts).
const tAr = createTranslator({ locale: 'ar', messages: ar });
const tEn = createTranslator({ locale: 'en', messages: en });

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <title>{FALLBACK_NOT_FOUND_TITLE}</title>
        <main id="main">
          <h1>{tAr('common.notFound.title')}</h1>
          <p>{tAr('common.notFound.body')}</p>
          <p>
            <Link href="/ar">{tAr('common.actions.goHome')}</Link>
          </p>
          <div lang="en" dir="ltr">
            <h2>{tEn('common.notFound.title')}</h2>
            <p>{tEn('common.notFound.body')}</p>
            <p>
              <Link href="/en">{tEn('common.actions.goHome')}</Link>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
