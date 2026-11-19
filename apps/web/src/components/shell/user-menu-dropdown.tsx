'use client';

import { LogOut, UserRound } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOutAction } from '@/features/auth/actions';
import { ClientLink } from '@/i18n/client-link';
import type { Direction } from '@/lib/locale';
import { runSignOut } from './sign-out';
import { USER_MENU_TRIGGER_CLASS, type PendingOpen, type UserMenuLabels } from './user-menu';

const SIGN_OUT_FORM_ID = 'user-menu-sign-out';

export type UserMenuDropdownProps = Readonly<{
  name: string;
  roleLabel: string;
  labels: UserMenuLabels;
  dir: Direction;
  triggerContent: ReactNode;
  /** The stand-in button was activated before this arrived: open now. */
  pendingOpen: PendingOpen;
  /** The stand-in button had keyboard focus: move it to this trigger. */
  focusTrigger: boolean;
}>;

/**
 * The menu of `UserMenu` (user-menu.tsx), loaded on demand (PR-40). Sign-out is a form posting to
 * `signOutAction`; the menu stays open while it is sent, and the item then says it is busy
 * (`aria-disabled`, `aria-busy`, "Please wait…") and ignores further activation until the action
 * redirects or fails — like `SubmitButton`, whose `useFormStatus` cannot be used here because the item
 * renders in a portal, outside the form.
 */
export function UserMenuDropdown({
  name,
  roleLabel,
  labels,
  dir,
  triggerContent,
  pendingOpen,
  focusTrigger,
}: UserMenuDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Pending from the submit until the redirect to the sign-in screen. When the action fails without
  // redirecting (e.g. the network is down) the transition ends and the item can be used again.
  const [signingOut, startSigningOut] = useTransition();

  // Before the menu's own focus handling (passive effects), so that closing returns focus here.
  useLayoutEffect(() => {
    if (focusTrigger || pendingOpen !== null) triggerRef.current?.focus();
  }, [focusTrigger, pendingOpen]);

  // Opened from the keyboard before the menu arrived: start on the first item, as Radix does for a
  // keyboard opening. Runs after the menu's own mount focus (a child effect), which picked the panel.
  useEffect(() => {
    if (pendingOpen !== 'keyboard') return;
    contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [pendingOpen]);

  function signOut() {
    // runSignOut rethrows the redirect to the sign-in screen (and any other Next.js control-flow error)
    // for the router, and swallows only real failures, after which the item is usable again.
    startSigningOut(() => runSignOut(signOutAction));
  }

  function handleSignOutClick(event: MouseEvent<HTMLButtonElement>) {
    if (signingOut) event.preventDefault();
  }

  return (
    <>
      {/* Outside the menu (which renders in a portal), so the menu keeps only menu items. */}
      <form id={SIGN_OUT_FORM_ID} action={signOut} hidden />
      {/* Non-modal: a modal menu hides the rest of the page with aria-hidden while its links stay
          focusable (axe aria-hidden-focus). Focus still moves into the menu, Tab cannot leave it,
          Escape and an outside click close it, and focus returns to the trigger. */}
      <DropdownMenu dir={dir} modal={false} defaultOpen={pendingOpen !== null}>
        <DropdownMenuTrigger
          ref={triggerRef}
          data-slot="user-menu-trigger"
          className={USER_MENU_TRIGGER_CLASS}
        >
          {triggerContent}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-slot="user-menu" ref={contentRef}>
          <DropdownMenuLabel className="flex flex-col">
            <bdi className="font-semibold break-words">{name}</bdi>
            <span className="text-sm text-muted-foreground">{roleLabel}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <ClientLink href="/profile">
                <UserRound aria-hidden="true" />
                {labels.profile}
              </ClientLink>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              // Keep the menu (and so the button) mounted until the form has been sent.
              onSelect={(event) => event.preventDefault()}
            >
              <button
                type="submit"
                form={SIGN_OUT_FORM_ID}
                aria-disabled={signingOut || undefined}
                aria-busy={signingOut || undefined}
                onClick={handleSignOutClick}
                data-slot="user-menu-sign-out"
              >
                <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
                {signingOut ? labels.pending : labels.signOut}
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
