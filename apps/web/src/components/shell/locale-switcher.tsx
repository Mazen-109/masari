import { useLocale, useTranslations } from 'next-intl';
import { isLocale, otherLocale, DEFAULT_LOCALE } from '@/lib/locale';
import { LocaleSwitchLink } from './locale-switch-link';

/**
 * The language switch (contracts/routes.md §1): links to the same path + query in the other locale. The
 * label is written in the target language (`common.switchLanguage` holds the other language's own name).
 * Translated here, on the server, so the client part (locale-switch-link.tsx) carries no message code.
 * `remember` (signed in) also stores the choice with the account (FR-037).
 */
export function LocaleSwitcher({
  className,
  remember = false,
}: Readonly<{ className?: string; remember?: boolean }>) {
  const t = useTranslations('common');
  const locale = useLocale();
  const target = otherLocale(isLocale(locale) ? locale : DEFAULT_LOCALE);

  return (
    <LocaleSwitchLink
      label={t('switchLanguage')}
      target={target}
      className={className}
      remember={remember}
    />
  );
}
