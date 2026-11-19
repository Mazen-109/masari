import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { DEFAULT_LOCALE, isLocale, localizeHref, type Locale } from '@/lib/locale';

// On a 404 render Next.js takes the title from the layouts plus the deepest `not-found` file of the
// matched tree, not from the page that called `notFound()` — so the localized 404 title
// (`<Screen> · مساري`, contracts/routes.md §1) is set here. The locale is always valid at this point:
// for an unknown locale (`/fr`) `[locale]/layout.tsx` calls `notFound()` itself, Next.js emits no
// metadata title, and `app/not-found.tsx` renders the bilingual `<title>` element instead (routes.md §5).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Safe cast: `[locale]/layout.tsx` already called `notFound()` for an unknown locale, so this file only
  // renders with `ar` or `en`.
  const t = await getTranslations({ locale: locale as Locale, namespace: 'meta' });
  return { title: t('notFound') };
}

// Localized 404 for unknown paths under a valid locale (contracts/routes.md §5). The home link is a plain
// anchor: this boundary is part of every page's scripts, and `next/link` would add its own copy there
// (PR-40); leaving a 404 with a full page load costs nothing noticeable.
export default async function LocaleNotFound() {
  const t = await getTranslations('common');
  const locale = await getLocale();
  const home = localizeHref(isLocale(locale) ? locale : DEFAULT_LOCALE, '/');

  return (
    <main id="main">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <a href={home}>{t('actions.goHome')}</a>
      </p>
      <LocaleSwitcher />
    </main>
  );
}
