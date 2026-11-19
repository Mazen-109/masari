'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { Direction } from '@/lib/locale';
import { preloadWhenIdle } from './lazy-ui';
import type { UserMenuDropdownProps } from './user-menu-dropdown';

/**
 * The user menu of the signed-in header (contracts/routes.md §4): the user's name and role label, a link
 * to the profile, and sign-out. The trigger is named "Account menu: <name>"; from 640 px the name is
 * also shown. Hidden without JavaScript, where the header shows a plain sign-out button instead.
 *
 * Only the trigger is part of the page's first scripts (PR-40, FR-043). The menu itself (Radix Dropdown
 * Menu, user-menu-dropdown.tsx) is fetched once the page is idle after loading, or at the first
 * activation if that comes earlier. Until then an identical button stands in for the Radix trigger; it
 * is marked busy after a press. When the menu arrives it takes the button's place, keeps keyboard focus
 * on it, and opens straight away if the button was pressed meanwhile — unless the user has moved on (a
 * press elsewhere, or focus leaving the button). If the menu cannot be fetched, the button stays usable and the next press tries
 * again.
 */

export type UserMenuLabels = Readonly<{ profile: string; signOut: string; pending: string }>;

/** How the stand-in button was activated before the menu arrived. */
export type PendingOpen = 'keyboard' | 'pointer' | null;

export const USER_MENU_TRIGGER_CLASS =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 font-medium text-foreground hover:bg-muted noscript:hidden';

const loadDropdown = () => import('./user-menu-dropdown');

type Loaded = Readonly<{
  Dropdown: ComponentType<UserMenuDropdownProps>;
  pendingOpen: PendingOpen;
  focusTrigger: boolean;
}>;

export function UserMenu(
  props: Readonly<{
    name: string;
    roleLabel: string;
    labels: UserMenuLabels;
    dir: Direction;
    /** The trigger's content (icon, accessible name, visible name, chevron), rendered on the server. */
    triggerContent: ReactNode;
  }>,
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen>(null);
  // Read when the menu arrives; the state above drives the busy mark.
  const pendingRef = useRef<PendingOpen>(null);
  const standInRef = useRef<HTMLButtonElement>(null);
  const requested = useRef(false);

  const request = useCallback((value: PendingOpen) => {
    pendingRef.current = value;
    setPendingOpen(value);
  }, []);

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    loadDropdown().then(
      (module) => {
        setLoaded({
          Dropdown: module.UserMenuDropdown,
          pendingOpen: pendingRef.current,
          focusTrigger: document.activeElement === standInRef.current,
        });
      },
      () => {
        // Offline or a failed chunk: not busy any more; the next activation tries again.
        requested.current = false;
        request(null);
      },
    );
  }, [request]);

  useEffect(() => preloadWhenIdle(load), [load]);

  // A press is dropped when the user moves on before the menu arrives: a pointer press elsewhere (some
  // browsers do not focus a clicked button, so blur alone is not enough) or focus leaving the button.
  useEffect(() => {
    if (pendingOpen === null) return;
    const cancelOutside = (event: PointerEvent) => {
      if (!standInRef.current?.contains(event.target as Node)) request(null);
    };
    document.addEventListener('pointerdown', cancelOutside, true);
    return () => document.removeEventListener('pointerdown', cancelOutside, true);
  }, [pendingOpen, request]);

  if (loaded !== null) {
    const { Dropdown } = loaded;
    return (
      <Dropdown {...props} pendingOpen={loaded.pendingOpen} focusTrigger={loaded.focusTrigger} />
    );
  }

  return (
    <button
      ref={standInRef}
      type="button"
      className={USER_MENU_TRIGGER_CLASS}
      aria-haspopup="menu"
      aria-expanded={false}
      aria-busy={pendingOpen !== null || undefined}
      data-slot="user-menu-trigger"
      onClick={(event) => {
        // `detail` is 0 for a click produced by Enter or Space.
        request(event.detail === 0 ? 'keyboard' : 'pointer');
        load();
      }}
      onBlur={() => request(null)}
    >
      {props.triggerContent}
    </button>
  );
}
