import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { dirOf } from '@/lib/locale';
// IBM Plex Sans Arabic (OFL-1.1), self-hosted: the font files are bundled and served by the app, never
// from a font CDN (CSP `font-src 'self'`). Each weight's CSS splits glyphs into unicode-range subsets,
// so English pages do not download the Arabic subset. Fallback stack: `--font-sans` in globals.css.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '../globals.css';

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return { robots: { index: false, follow: false } };
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: t('home'), template: t('titleTemplate') },
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
