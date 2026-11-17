import type { Locale } from './locale';

// Static bilingual text for pages rendered where no locale or message catalog is available
// (`app/global-error.tsx`, titles of 404s for an unknown locale). Importing the catalogs into the
// client-side global error page would ship both to every page, so the strings are copied here;
// `src/i18n/messages.test.ts` asserts they equal the catalog entries named in each comment.
export const FALLBACK_TEXT = {
  ar: {
    errorTitle: 'حدث خطأ غير متوقع', // common.error.title
    errorBody: 'تعذّر إكمال طلبك الآن. حاول مرة أخرى بعد قليل.', // common.error.body
    tryAgain: 'حاول مرة أخرى', // common.actions.tryAgain
    notFoundTitle: 'الصفحة غير موجودة', // meta.notFound
  },
  en: {
    errorTitle: 'Something went wrong',
    errorBody: "We couldn't complete your request right now. Please try again in a moment.",
    tryAgain: 'Try again',
    notFoundTitle: 'Page not found',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export const FALLBACK_SEPARATOR = ' · ';

export const FALLBACK_ERROR_TITLE = `${FALLBACK_TEXT.ar.errorTitle}${FALLBACK_SEPARATOR}${FALLBACK_TEXT.en.errorTitle}`;

export const FALLBACK_NOT_FOUND_TITLE = `${FALLBACK_TEXT.ar.notFoundTitle}${FALLBACK_SEPARATOR}${FALLBACK_TEXT.en.notFoundTitle}`;
