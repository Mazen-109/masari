'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useTransition, type MouseEvent } from 'react';
import { setLocaleAction } from '@/features/profile/actions';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { dirOf, otherLocale } from '@/lib/locale';

// Links to the same path + query in the other locale (contracts/routes.md §1). The label is
// written in the target language (`common.switchLanguage` holds the other language's own name)
// and carries that language's `lang` and `dir`, so screen readers announce it correctly.
//
// Signed in (`remember`), a plain click first stores the language with the account (FR-037,
// `setLocaleAction`) and then navigates, whatever the answer: the switch never depends on that call.
// Without JavaScript, signed out, or with a modifier key (new tab/window) it stays a plain link.
type SwitchProps = Readonly<{ className?: string; remember?: boolean }>;

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function SwitchLink({ search, className, remember = false }: SwitchProps & { search: string }) {
  const t = useTranslations('common');
  const target = otherLocale(useLocale());
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitching] = useTransition();
  const href = search ? `${pathname}?${search}` : pathname;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!remember || !isPlainClick(event)) return;
    event.preventDefault();
    if (switching) return;
    startSwitching(async () => {
      try {
        await setLocaleAction(target);
      } catch {
        // Not remembered (e.g. offline); the user still gets the language they asked for.
      }
      router.push(href, { locale: target });
    });
  }

  return (
    <Link
      href={href}
      locale={target}
      hrefLang={target}
      lang={target}
      dir={dirOf(target)}
      className={className}
      aria-busy={switching || undefined}
      onClick={handleClick}
    >
      {t('switchLanguage')}
    </Link>
  );
}

function SwitchLinkWithQuery(props: SwitchProps) {
  const search = useSearchParams().toString();
  return <SwitchLink search={search} {...props} />;
}

export function LocaleSwitcher(props: SwitchProps) {
  // Statically rendered pages have no query at build time; the query is filled in on the client.
  return (
    <Suspense fallback={<SwitchLink search="" {...props} />}>
      <SwitchLinkWithQuery {...props} />
    </Suspense>
  );
}
