'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui sheet (Radix Dialog), adapted to Masari tokens (DESIGN.md "Elevation & Depth"): a `surface`
// panel at the inline-start edge (logical `start-0`, so it opens from the right in Arabic), the soft
// `shadow-md` of floating layers, no animation library. Radix traps focus, closes on Escape and on an
// outside click, and returns focus to the trigger.
function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> & {
  /** Accessible name of the close button (a translated "Close"). */
  closeLabel: string;
  side?: 'start' | 'end';
};

function SheetContent({
  className,
  children,
  closeLabel,
  side = 'start',
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-40 bg-foreground/40"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-4/5 max-w-sm flex-col gap-4 overflow-y-auto bg-surface p-4 text-foreground shadow-md',
          side === 'start' ? 'start-0 border-e border-border' : 'end-0 border-s border-border',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute end-2 top-2 inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
          aria-label={closeLabel}
        >
          <X aria-hidden="true" className="size-5" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1 pe-12', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-xl font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-base text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger };
