import { useTranslations } from 'next-intl';

// First focusable element of every screen (contracts/routes.md §7). Hidden until focused; activating
// it moves focus to `<main id="main" tabIndex={-1}>`. A plain anchor, so it works without JavaScript.
export function SkipLink() {
  const t = useTranslations('common');

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-surface focus:px-4 focus:font-medium focus:text-primary focus:shadow-md"
    >
      {t('skipToContent')}
    </a>
  );
}
