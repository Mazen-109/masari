import { useLocale } from 'next-intl';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';

/**
 * Pieces shared by the signed-in header (AppHeader) and the onboarding header, so both stay identical:
 * the college name in the current language and the remembering language switch.
 */

/** The college's name in the current language; on its own row below 640 px, truncated if too long. */
export function HeaderCollegeName({
  nameAr,
  nameEn,
}: Readonly<{ nameAr: string; nameEn: string }>) {
  const locale = useLocale();
  return (
    <p
      className="order-last min-w-0 basis-full truncate text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto"
      data-slot="college-name"
    >
      {locale === 'ar' ? nameAr : nameEn}
    </p>
  );
}

/**
 * The language switch of signed-in screens (both headers and the profile screen): also stores the choice
 * with the account (FR-037).
 */
export function SignedInLocaleSwitcher() {
  return (
    <LocaleSwitcher
      remember
      className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-primary underline-offset-4 hover:underline"
    />
  );
}
