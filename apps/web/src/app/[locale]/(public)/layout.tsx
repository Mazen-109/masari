import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PrivacyLink } from '@/components/shell/privacy-link';
import { PublicHeader } from '@/components/shell/public-header';
import { SkipLink } from '@/components/shell/skip-link';
import { routing } from '@/i18n/routing';

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

// Shell of the signed-out screens (contracts/routes.md §2): skip link, public header, centred content in
// `<main id="main">`, and a footer linking to the privacy notice (FR-011).
export default async function PublicLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <PublicHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-16"
      >
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4 sm:px-6">
          <PrivacyLink className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4" />
        </div>
      </footer>
    </div>
  );
}
