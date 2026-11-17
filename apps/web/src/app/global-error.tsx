'use client';

import './globals.css';

type Props = Readonly<{
  error: unknown;
  retry: () => void;
}>;

// Last-resort error page when the locale layout itself fails (contracts/routes.md §5). It replaces
// every layout, so no locale or message catalog is available: the text is static and bilingual,
// mirroring `common.error.*` and `common.actions.tryAgain` in `messages/{ar,en}.json`. Kept as
// constants (not JSX literals) so the catalog rule stays on; never shows error details.
const TEXT = {
  ar: {
    title: 'حدث خطأ غير متوقع',
    body: 'تعذّر إكمال طلبك الآن. حاول مرة أخرى بعد قليل.',
    tryAgain: 'حاول مرة أخرى',
  },
  en: {
    title: 'Something went wrong',
    body: "We couldn't complete your request right now. Please try again in a moment.",
    tryAgain: 'Try again',
  },
} as const;

const SEPARATOR = ' · ';
const DOCUMENT_TITLE = `${TEXT.ar.title}${SEPARATOR}${TEXT.en.title}`;

export default function GlobalError({ retry }: Props) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <title>{DOCUMENT_TITLE}</title>
        <main id="main">
          <h1>{TEXT.ar.title}</h1>
          <p>{TEXT.ar.body}</p>
          <div lang="en" dir="ltr">
            <h2>{TEXT.en.title}</h2>
            <p>{TEXT.en.body}</p>
          </div>
          <button type="button" onClick={() => retry()}>
            <span>{TEXT.ar.tryAgain}</span>
            <span aria-hidden="true">{SEPARATOR}</span>
            <span lang="en" dir="ltr">
              {TEXT.en.tryAgain}
            </span>
          </button>
        </main>
      </body>
    </html>
  );
}
