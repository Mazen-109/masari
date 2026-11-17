import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { Link } from '@/i18n/navigation';

// Header of signed-out screens (contracts/routes.md §2): wordmark linking home, language switch.
export function PublicHeader() {
  const t = useTranslations('common');

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md text-2xl font-bold text-primary"
        >
          {t('appName')}
        </Link>
        <LocaleSwitcher className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-primary underline-offset-4 hover:underline" />
      </div>
    </header>
  );
}
