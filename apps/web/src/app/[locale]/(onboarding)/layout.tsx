import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { HeaderCollegeName, SignedInLocaleSwitcher } from '@/components/shell/header-parts';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { SkipLink } from '@/components/shell/skip-link';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

/**
 * Minimal shell of the profile-completion step (contracts/routes.md §3): skip link → header (wordmark,
 * college name in the current language, language switch, sign out) → `<main id="main">`. No navigation:
 * nothing else is reachable until the profile exists. The page guards itself; without a session the header
 * is left out while the page redirects.
 */
export default async function OnboardingLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await getSessionContext();
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {ctx === null ? null : (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
            <p className="inline-flex min-h-11 items-center text-2xl font-bold text-primary">
              {t('appName')}
            </p>
            <HeaderCollegeName nameAr={ctx.tenant.nameAr} nameEn={ctx.tenant.nameEn} />
            <div className="ms-auto flex items-center gap-2 sm:ms-0">
              <SignedInLocaleSwitcher />
              <SignOutButton />
            </div>
          </div>
        </header>
      )}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-16"
      >
        {children}
      </main>
    </div>
  );
}
