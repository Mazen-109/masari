import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { Link } from '@/i18n/navigation';

// Localized 404 for unknown paths under a valid locale (contracts/routes.md §5).
export default async function LocaleNotFound() {
  const t = await getTranslations('common');

  return (
    <main id="main">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <Link href="/">{t('actions.goHome')}</Link>
      </p>
      <LocaleSwitcher />
    </main>
  );
}
