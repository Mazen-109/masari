import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui native select, adapted to Masari tokens: a native `<select>` (no Radix dependency) so forms
// submit its value and work without JavaScript, with the look of `Input`. The browser draws the arrow on
// the inline-end side in both directions.
function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'flex min-h-11 w-full min-w-0 cursor-pointer rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
