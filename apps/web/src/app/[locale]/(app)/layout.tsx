import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { SkipLink } from '@/components/shell/skip-link';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

/**
 * Shell of the signed-in screens (contracts/routes.md §4; minimal until PR-19 adds navigation and the
 * user menu): skip link → header (wordmark, college name in the current language, language switch, sign
 * out) → `<main id="main">`. The layout only reads the session for the header; every page guards itself
 * (requireSession / requirePermission), so without a session the header is simply left out while the
 * page redirects.
 */
export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Per request (session); never prerendered at build time, where no environment exists.
  await connection();
  const ctx = await getSessionContext();
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {ctx === null ? null : (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-md text-2xl font-bold text-primary"
            >
              {t('appName')}
            </Link>
            <p className="min-w-0 flex-1 truncate text-muted-foreground" data-slot="college-name">
              {locale === 'ar' ? ctx.tenant.nameAr : ctx.tenant.nameEn}
            </p>
            <div className="flex items-center gap-2">
              <LocaleSwitcher className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-primary underline-offset-4 hover:underline" />
              <SignOutButton />
            </div>
          </div>
        </header>
      )}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-12"
      >
        {children}
      </main>
    </div>
  );
}
