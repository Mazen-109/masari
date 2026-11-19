'use client';

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { preloadWhenIdle } from './lazy-ui';
import type { RenderedNavSection } from './nav-list';

/**
 * Navigation drawer below 1024 px (contracts/routes.md §4 and §7): a menu button opens a sheet at the
 * inline-start edge with the same entries as the sidebar. Focus is trapped inside while it is open;
 * Escape, the close button, an outside click, or choosing an entry closes it, and focus returns to the
 * menu button. Hidden without JavaScript, where the sidebar is shown instead. When the viewport widens
 * to 1024 px while it is open, it closes: the sidebar takes over, and two "Main navigation" landmarks
 * never coexist.
 *
 * Only the button is part of the page's first scripts (PR-40, FR-043): the drawer (Radix Dialog) is a
 * separate chunk, fetched once the page is idle after loading, or at the first press if that comes
 * earlier — the drawer then opens as soon as it has arrived. The button is rendered here, not by Radix,
 * so it exists from the first paint; the drawer returns focus to it.
 */

export type MobileNavLabels = Readonly<{
  openMenu: string;
  closeMenu: string;
  menuTitle: string;
  navLabel: string;
}>;

const loadDrawer = () => import('./mobile-nav-drawer');
const MobileNavDrawer = lazy(loadDrawer);

/** Tailwind's `lg` breakpoint (64 rem), where the sidebar replaces the drawer. */
const SIDEBAR_QUERY = '(min-width: 64rem)';

export function MobileNav({
  sections,
  labels,
  triggerClassName,
  triggerIcon,
}: Readonly<{
  sections: RenderedNavSection[];
  labels: MobileNavLabels;
  /** The button's classes (a ghost icon `Button`), computed on the server. */
  triggerClassName: string;
  /** The decorative menu icon, rendered on the server. */
  triggerIcon: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so Radix sees every later open/close.
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => preloadWhenIdle(loadDrawer), []);

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
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={labels.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-slot="mobile-nav-trigger"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {triggerIcon}
      </button>
      {mounted ? (
        <Suspense fallback={null}>
          <MobileNavDrawer
            open={open}
            onOpenChange={setOpen}
            sections={sections}
            labels={labels}
            triggerRef={triggerRef}
          />
        </Suspense>
      ) : null}
    </>
  );
}
