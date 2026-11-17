import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getSessionContext } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

/** The locale root (contracts/routes.md §2): signed in → the dashboard, signed out → sign-in. */
export default async function LocaleRootPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Decided per request; never prerendered at build time, where no environment exists.
  await connection();
  const signedIn = (await getSessionContext()) !== null;
  redirect(`/${locale}/${signedIn ? 'dashboard' : 'sign-in'}`);
}
