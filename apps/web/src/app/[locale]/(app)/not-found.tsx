import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/locale';

// Title of the 404 inside the shell: Next.js takes it from the deepest `not-found` file, not from the page
// that called `notFound()` (contracts/routes.md §1). The locale is valid here: `[locale]/layout.tsx`
// already answered an unknown locale.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'meta' });
  return { title: t('notFound') };
}

/**
 * Localized 404 rendered inside the signed-in shell (contracts/routes.md §5), so that `notFound()` from an
 * `(app)` page — missing permission, disabled or unknown module — keeps the header and navigation. The
 * layout provides `<main id="main">`; this renders only its content.
 */
export default async function AppNotFound() {
  const t = await getTranslations('common');

  return (
    <div className="flex max-w-2xl flex-col gap-4" data-slot="not-found">
      <h1 className="text-3xl font-bold text-balance">{t('notFound.title')}</h1>
      <p className="text-lg text-muted-foreground">{t('notFound.body')}</p>
      <p>
        <Link href="/dashboard">{t('actions.goHome')}</Link>
      </p>
    </div>
  );
}
