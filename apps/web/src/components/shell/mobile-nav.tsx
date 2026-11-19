'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { preloadWhenIdle } from './lazy-ui';
import type { MobileNavDrawerProps } from './mobile-nav-drawer';
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
 * earlier — the drawer then opens as soon as it has arrived, and the button says it is busy meanwhile.
 * If the chunk cannot be fetched (offline), the button stays usable and the next press tries again; the
 * rest of the screen is unaffected. The button is rendered here, not by Radix, so it exists from the
 * first paint; the drawer returns focus to it.
 */

export type MobileNavLabels = Readonly<{
  openMenu: string;
  closeMenu: string;
  menuTitle: string;
  navLabel: string;
}>;

const loadDrawer = () => import('./mobile-nav-drawer');

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
  const [Drawer, setDrawer] = useState<ComponentType<MobileNavDrawerProps> | null>(null);
  // Requested by the user: shown as soon as the drawer is there.
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requested = useRef(false);
  const contentId = useId();

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    loadDrawer().then(
      (module) => setDrawer(() => module.default),
      () => {
        // Offline or a failed chunk: stay closed; the next press tries again.
        requested.current = false;
        setOpen(false);
      },
    );
  }, []);

  useEffect(() => preloadWhenIdle(load), [load]);

  const shown = open && Drawer !== null;

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
        aria-expanded={shown}
        aria-controls={shown ? contentId : undefined}
        aria-busy={(open && Drawer === null) || undefined}
        data-slot="mobile-nav-trigger"
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        {triggerIcon}
      </button>
      {Drawer === null ? null : (
        <Drawer
          open={open}
          onOpenChange={setOpen}
          sections={sections}
          labels={labels}
          triggerRef={triggerRef}
          contentId={contentId}
        />
      )}
    </>
  );
}
