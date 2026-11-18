import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui table, adapted to Masari tokens (DESIGN.md "Neutral"; contracts/routes.md §7): a `surface`
// sheet with `border` rule lines, header row on `muted`, `text-sm` cells, logical alignment
// (`text-start`). The container scrolls horizontally on narrow screens; pass `containerProps` to make it
// a focusable, labelled region (`role="region"`, `aria-labelledby`, `tabIndex={0}`).
function Table({
  className,
  containerProps,
  ...props
}: ComponentProps<'table'> & { containerProps?: ComponentProps<'div'> }) {
  const { className: containerClassName, ...restContainer } = containerProps ?? {};
  return (
    <div
      data-slot="table-container"
      className={cn(
        'relative w-full overflow-x-auto rounded-lg border border-border bg-surface',
        containerClassName,
      )}
      {...restContainer}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-muted [&_tr]:border-b [&_tr]:border-border', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border bg-muted font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-border transition-colors', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-11 px-4 text-start align-middle font-medium whitespace-nowrap text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-4 py-3 text-start align-middle whitespace-nowrap', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
