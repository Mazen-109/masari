'use client';

import {
  FALLBACK_ERROR_TITLE,
  FALLBACK_SEPARATOR,
  FALLBACK_TEXT as TEXT,
} from '@/lib/fallback-text';
import './globals.css';
import './fonts';

type Props = Readonly<{
  error: unknown;
  retry: () => void;
}>;

// Last-resort error page when the locale layout itself fails (contracts/routes.md §5). It replaces
// every layout, so no locale or message catalog is available: the text is static and bilingual
// (`lib/fallback-text.ts`, kept equal to the catalogs by a test). Never shows error details.
export default function GlobalError({ retry }: Props) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <title>{FALLBACK_ERROR_TITLE}</title>
        <main id="main">
          <h1>{TEXT.ar.errorTitle}</h1>
          <p>{TEXT.ar.errorBody}</p>
          <div lang="en" dir="ltr">
            <h2>{TEXT.en.errorTitle}</h2>
            <p>{TEXT.en.errorBody}</p>
          </div>
          <button type="button" onClick={() => retry()}>
            <span>{TEXT.ar.tryAgain}</span>
            <span aria-hidden="true">{FALLBACK_SEPARATOR}</span>
            <span lang="en" dir="ltr">
              {TEXT.en.tryAgain}
            </span>
          </button>
        </main>
      </body>
    </html>
  );
}
