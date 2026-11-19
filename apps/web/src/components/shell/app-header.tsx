import { ChevronDown, CircleUser, Menu } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { signOutAction } from '@/features/auth/actions';
import { Link } from '@/i18n/navigation';
import { DEFAULT_LOCALE, dirOf, isLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
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
 *
 * Everything is translated and styled here, on the server, and handed to the client parts as text and
 * class names, so the header loads no message or class-merging code in the browser (PR-40).
 */
export function AppHeader({
  collegeNameAr,
  collegeNameEn,
  userName,
  roleLabel,
  sections,
}: AppHeaderProps) {
  const t = useTranslations('common');
  const tNav = useTranslations('nav');
  const tSignOut = useTranslations('auth.signOut');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  const userMenuLabel = tNav('userMenu', { name: userName });

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:gap-x-4 sm:px-6">
        <MobileNav
          sections={sections}
          labels={{
            openMenu: tNav('openMenu'),
            closeMenu: tNav('closeMenu'),
            menuTitle: tNav('menuTitle'),
            navLabel: tNav('label'),
          }}
          // The classes `Button` would give it, merged here so the browser needs no `cn`.
          triggerClassName={cn(
            buttonVariants({
              variant: 'ghost',
              size: 'icon',
              className: 'lg:hidden noscript:hidden',
            }),
          )}
          triggerIcon={<Menu aria-hidden="true" />}
        />
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-md text-2xl font-bold text-primary"
        >
          {t('appName')}
        </Link>
        <HeaderCollegeName nameAr={collegeNameAr} nameEn={collegeNameEn} />
        <div className="ms-auto flex items-center gap-1 sm:ms-0 sm:gap-2">
          <SignedInLocaleSwitcher />
          <UserMenu
            name={userName}
            roleLabel={roleLabel}
            dir={dirOf(isLocale(locale) ? locale : DEFAULT_LOCALE)}
            labels={{
              profile: tNav('profile'),
              signOut: tSignOut('submit'),
              pending: tActions('pending'),
            }}
            triggerContent={
              <>
                <CircleUser aria-hidden="true" className="size-6 shrink-0" />
                {/* The accessible name ("Account menu: <name>") contains the visible name (WCAG 2.5.3). */}
                <span className="sr-only">{userMenuLabel}</span>
                <bdi aria-hidden="true" className="hidden max-w-40 truncate sm:inline">
                  {userName}
                </bdi>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
              </>
            }
          />
          {/* The whole form is hidden with JavaScript on, so it leaves no gap in the row. Rendered
              entirely here (not `SignOutButton`): without JavaScript no pending state can appear, and
              this header then loads no form or message code in the browser. */}
          <div className="hidden noscript:block" data-slot="noscript-sign-out">
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                {tSignOut('submit')}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
