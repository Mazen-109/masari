'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NavList, type RenderedNavSection } from './nav-list';

/**
 * Navigation drawer below 1024 px (contracts/routes.md §4 and §7): a menu button opens a sheet at the
 * inline-start edge with the same entries as the sidebar. Focus is trapped inside while it is open;
 * Escape, the close button, an outside click, or choosing an entry closes it, and focus returns to the
 * menu button. Hidden without JavaScript, where the sidebar is shown instead. When the viewport widens
 * to 1024 px while it is open, it closes: the sidebar takes over, and two "Main navigation" landmarks
 * never coexist.
 */

/** Tailwind's `lg` breakpoint (64 rem), where the sidebar replaces the drawer. */
const SIDEBAR_QUERY = '(min-width: 64rem)';
export function MobileNav({ sections }: Readonly<{ sections: RenderedNavSection[] }>) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // The drawer can only be opened below 1024 px (its button is hidden above), so only a later
    // change to the wide layout needs handling.
    const query = window.matchMedia(SIDEBAR_QUERY);
    const closeOnWide = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', closeOnWide);
    return () => query.removeEventListener('change', closeOnWide);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden noscript:hidden"
          aria-label={t('openMenu')}
          data-slot="mobile-nav-trigger"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t('closeMenu')} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t('menuTitle')}</SheetTitle>
        </SheetHeader>
        <nav aria-label={t('label')}>
          <NavList sections={sections} idPrefix="drawer" onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
