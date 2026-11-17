import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/shell/app-header';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { getNavSections } from '@/components/shell/nav-sections';
import { SkipLink } from '@/components/shell/skip-link';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

/**
 * Shell of the signed-in screens (contracts/routes.md §4): skip link → header (drawer button, wordmark,
 * college name in the current language, language switch, user menu) → navigation (sidebar from 1024 px,
 * drawer below) → `<main id="main">`. The layout only reads the session to draw the shell; every page
 * guards itself (requireSession / requirePermission), so without a session the shell is simply left out
 * while the page redirects.
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
  const sections = ctx === null ? [] : await getNavSections(ctx);

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {ctx === null ? null : (
        <AppHeader
          collegeNameAr={ctx.tenant.nameAr}
          collegeNameEn={ctx.tenant.nameEn}
          userName={ctx.user.name}
          roleLabel={t(`roles.${ctx.user.role}`)}
          sections={sections}
        />
      )}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row lg:gap-8 lg:px-6">
        {ctx === null ? null : <AppSidebar sections={sections} />}
        <main
          id="main"
          tabIndex={-1}
          className="w-full max-w-5xl min-w-0 flex-1 px-4 py-10 sm:px-6 sm:py-12 lg:px-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
