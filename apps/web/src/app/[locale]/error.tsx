'use client';

import { useTranslations } from 'next-intl';

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

// Localized generic error; never shows error details (contracts/routes.md §5).
export default function LocaleError({ reset }: Props) {
  const t = useTranslations('common');

  return (
    <main id="main">
      <h1>{t('error.title')}</h1>
      <p>{t('error.body')}</p>
      <button type="button" onClick={() => reset()}>
        {t('actions.tryAgain')}
      </button>
    </main>
  );
}
