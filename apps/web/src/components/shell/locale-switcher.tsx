'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { dirOf, otherLocale } from '@/lib/locale';

// Links to the same path + query in the other locale (contracts/routes.md §1). The label is
// written in the target language (`common.switchLanguage` holds the other language's own name)
// and carries that language's `lang` and `dir`, so screen readers announce it correctly.
function SwitchLink({ search }: Readonly<{ search: string }>) {
  const t = useTranslations('common');
  const target = otherLocale(useLocale());
  const pathname = usePathname();
  const href = search ? `${pathname}?${search}` : pathname;

  return (
    <Link href={href} locale={target} hrefLang={target} lang={target} dir={dirOf(target)}>
      {t('switchLanguage')}
    </Link>
  );
}

function SwitchLinkWithQuery() {
  const search = useSearchParams().toString();
  return <SwitchLink search={search} />;
}

export function LocaleSwitcher() {
  // Statically rendered pages have no query at build time; the query is filled in on the client.
  return (
    <Suspense fallback={<SwitchLink search="" />}>
      <SwitchLinkWithQuery />
    </Suspense>
  );
}
