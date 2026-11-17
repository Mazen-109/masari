'use client';

import { ChevronDown, CircleUser, LogOut, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition, type MouseEvent } from 'react';
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
import { Link } from '@/i18n/navigation';
import { dirOf, isLocale } from '@/lib/locale';

const SIGN_OUT_FORM_ID = 'user-menu-sign-out';

/**
 * The user menu of the signed-in header (contracts/routes.md §4): the user's name and role label, a link
 * to the profile, and sign-out. The trigger is named "Account menu: <name>"; from 640 px the name is
 * also shown. Sign-out is a form posting to `signOutAction`; the menu stays open while it is sent, and
 * the item then says it is busy (`aria-disabled`, `aria-busy`, "Please wait…") and ignores further
 * activation until the action redirects or fails — like `SubmitButton`, whose `useFormStatus` cannot be
 * used here because the item renders in a portal, outside the form. Hidden without JavaScript, where the
 * header shows a plain sign-out button instead.
 */
export function UserMenu({ name, roleLabel }: Readonly<{ name: string; roleLabel: string }>) {
  const t = useTranslations('nav');
  const tSignOut = useTranslations('auth.signOut');
  const tActions = useTranslations('common.actions');
  const locale = useLocale();
  // Pending from the submit until the redirect to the sign-in screen. When the action fails without
  // redirecting (e.g. the network is down) the transition ends and the item can be used again.
  const [signingOut, startSigningOut] = useTransition();

  function signOut() {
    startSigningOut(async () => {
      try {
        await signOutAction();
      } catch {
        // Nothing to show beyond the item becoming usable again; the user is still signed in.
      }
    });
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
      <DropdownMenu dir={isLocale(locale) ? dirOf(locale) : 'rtl'} modal={false}>
        <DropdownMenuTrigger
          data-slot="user-menu-trigger"
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 font-medium text-foreground hover:bg-muted noscript:hidden"
        >
          <CircleUser aria-hidden="true" className="size-6 shrink-0" />
          {/* The accessible name ("Account menu: <name>") contains the visible name (WCAG 2.5.3). */}
          <span className="sr-only">{t('userMenu', { name })}</span>
          <bdi aria-hidden="true" className="hidden max-w-40 truncate sm:inline">
            {name}
          </bdi>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-slot="user-menu">
          <DropdownMenuLabel className="flex flex-col">
            <bdi className="font-semibold break-words">{name}</bdi>
            <span className="text-sm text-muted-foreground">{roleLabel}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound aria-hidden="true" />
                {t('profile')}
              </Link>
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
                {signingOut ? tActions('pending') : tSignOut('submit')}
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
