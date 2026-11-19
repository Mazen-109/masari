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
 * activation if that comes earlier. Until then an identical button stands in for the Radix trigger; when
 * the menu arrives it takes the button's place, keeps keyboard focus on it, and opens straight away if
 * the button was activated meanwhile.
 */

export type UserMenuLabels = Readonly<{ profile: string; signOut: string; pending: string }>;

/** How the stand-in button was activated before the menu arrived. */
export type PendingOpen = 'keyboard' | 'pointer' | null;

export const USER_MENU_TRIGGER_CLASS =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 font-medium text-foreground hover:bg-muted noscript:hidden';

const loadDropdown = () => import('./user-menu-dropdown');

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
  const [Dropdown, setDropdown] = useState<ComponentType<UserMenuDropdownProps> | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen>(null);
  const [focusTrigger, setFocusTrigger] = useState(false);
  const standInRef = useRef<HTMLButtonElement>(null);
  const requested = useRef(false);

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    loadDropdown().then(
      (module) => {
        setFocusTrigger(document.activeElement === standInRef.current);
        setDropdown(() => module.UserMenuDropdown);
      },
      () => {
        // Offline or a failed chunk: the next activation tries again.
        requested.current = false;
      },
    );
  }, []);

  useEffect(() => preloadWhenIdle(load), [load]);

  if (Dropdown !== null) {
    return <Dropdown {...props} pendingOpen={pendingOpen} focusTrigger={focusTrigger} />;
  }

  return (
    <button
      ref={standInRef}
      type="button"
      className={USER_MENU_TRIGGER_CLASS}
      aria-haspopup="menu"
      aria-expanded={false}
      data-slot="user-menu-trigger"
      onClick={(event) => {
        // `detail` is 0 for a click produced by Enter or Space.
        setPendingOpen(event.detail === 0 ? 'keyboard' : 'pointer');
        load();
      }}
    >
      {props.triggerContent}
    </button>
  );
}
