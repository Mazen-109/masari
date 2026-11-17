import { useTranslations } from 'next-intl';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { Link } from '@/i18n/navigation';
import { HeaderCollegeName, SignedInLocaleSwitcher } from './header-parts';
import { MobileNav } from './mobile-nav';
import type { RenderedNavSection } from './nav-list';
import { UserMenu } from './user-menu';

type AppHeaderProps = Readonly<{
  collegeNameAr: string;
  collegeNameEn: string;
  userName: string;
  roleLabel: string;
  sections: RenderedNavSection[];
}>;

/**
 * Header of the signed-in shell (contracts/routes.md §4): drawer button (below 1024 px), wordmark, college
 * name in the current language, language switch, user menu. In visual and DOM order alike, so the Tab
 * order follows what is seen in both directions. Without JavaScript the menu button and the user menu are
 * hidden and a plain sign-out button takes the user menu's place. Signed in, the language switch also
 * stores the choice with the account (FR-037).
 */
export function AppHeader({
  collegeNameAr,
  collegeNameEn,
  userName,
  roleLabel,
  sections,
}: AppHeaderProps) {
  const t = useTranslations('common');

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:gap-x-4 sm:px-6">
        <MobileNav sections={sections} />
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-md text-2xl font-bold text-primary"
        >
          {t('appName')}
        </Link>
        <HeaderCollegeName nameAr={collegeNameAr} nameEn={collegeNameEn} />
        <div className="ms-auto flex items-center gap-1 sm:ms-0 sm:gap-2">
          <SignedInLocaleSwitcher />
          <UserMenu name={userName} roleLabel={roleLabel} />
          {/* The whole form is hidden with JavaScript on, so it leaves no gap in the row. */}
          <div className="hidden noscript:block" data-slot="noscript-sign-out">
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
