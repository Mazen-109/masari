'use client';

import { useTranslations } from 'next-intl';

type Props = Readonly<{
  error: unknown;
  retry: () => void;
}>;

// Localized generic error; never shows error details (contracts/routes.md §5).
export default function LocaleError({ retry }: Props) {
  const t = useTranslations('common');

  return (
    <main id="main">
      <h1>{t('error.title')}</h1>
      <p>{t('error.body')}</p>
      <button type="button" onClick={() => retry()}>
        {t('actions.tryAgain')}
      </button>
    </main>
  );
}
