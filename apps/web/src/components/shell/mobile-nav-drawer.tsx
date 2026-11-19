'use client';

import type { RefObject } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { MobileNavLabels } from './mobile-nav';
import { NavList, type RenderedNavSection } from './nav-list';

/**
 * The drawer of `MobileNav`, loaded on demand (PR-40). Radix traps focus and closes on Escape or an
 * outside click; because the menu button is not a Radix trigger, focus is returned to it here.
 */
export default function MobileNavDrawer({
  open,
  onOpenChange,
  sections,
  labels,
  triggerRef,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: RenderedNavSection[];
  labels: MobileNavLabels;
  triggerRef: RefObject<HTMLButtonElement | null>;
}>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={labels.closeMenu}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{labels.menuTitle}</SheetTitle>
        </SheetHeader>
        <nav aria-label={labels.navLabel}>
          <NavList sections={sections} idPrefix="drawer" onNavigate={() => onOpenChange(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
