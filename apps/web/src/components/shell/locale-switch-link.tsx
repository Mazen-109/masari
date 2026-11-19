'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useTransition, type MouseEvent } from 'react';
import { setLocaleAction } from '@/features/profile/actions';
import { dirOf, switchLocalePath, type Locale } from '@/lib/locale';

// The link of the language switch (locale-switcher.tsx translates its label on the server). It carries
// the target language's `lang` and `dir`, so screen readers announce it correctly.
//
// Signed in (`remember`), a plain click first stores the language with the account (FR-037,
// `setLocaleAction`) and then navigates, whatever the answer: the switch never depends on that call.
// Without JavaScript, signed out, or with a modifier key (new tab/window) it stays a plain link.
//
// A plain anchor, not `next/link`: the switch is on every screen, and `next/link` would add its own
// copy to the script of each layout and 404 page that shows it (PR-40). Changing the language changes
// `<html lang dir>` and the whole page anyway, so a full page load is the natural navigation.
type SwitchProps = Readonly<{
  label: string;
  target: Locale;
  className?: string;
  remember: boolean;
}>;

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function SwitchLink({
  search,
  label,
  target,
  className,
  remember,
}: SwitchProps & { search: string }) {
  const pathname = switchLocalePath(usePathname(), target);
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
      window.location.assign(href);
    });
  }

  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      dir={dirOf(target)}
      className={className}
      aria-busy={switching || undefined}
      onClick={handleClick}
    >
      {label}
    </a>
  );
}

function SwitchLinkWithQuery(props: SwitchProps) {
  const search = useSearchParams().toString();
  return <SwitchLink search={search} {...props} />;
}

export function LocaleSwitchLink(props: SwitchProps) {
  // Statically rendered pages have no query at build time; the query is filled in on the client.
  return (
    <Suspense fallback={<SwitchLink search="" {...props} />}>
      <SwitchLinkWithQuery {...props} />
    </Suspense>
  );
}
