'use client';

import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/lib/locale';
import { FALLBACK_TEXT } from '@/lib/fallback-text';

type Props = Readonly<{
  error: unknown;
  retry: () => void;
}>;

// Localized generic error; never shows error details (contracts/routes.md §5). The text comes from
// `lib/fallback-text.ts` (kept equal to `common.error.*` and `common.actions.tryAgain` by a test), not
// from a message provider: this boundary is part of every page, so its code must stay small (PR-40).
export default function LocaleError({ retry }: Props) {
  const { locale } = useParams<{ locale?: string }>();
  const text = FALLBACK_TEXT[isLocale(locale) ? locale : DEFAULT_LOCALE];

  return (
    <main id="main">
      <h1>{text.errorTitle}</h1>
      <p>{text.errorBody}</p>
      <button type="button" onClick={() => retry()}>
        {text.tryAgain}
      </button>
    </main>
  );
}
