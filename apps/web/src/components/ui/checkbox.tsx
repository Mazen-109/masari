import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui checkbox, adapted: a native `<input type="checkbox">` instead of the Radix button, so forms
// submit its value and work without JavaScript. A 20 px box in the `primary` accent colour; an invalid
// box gets a `danger` outline. The caller's label row provides the 44 px target.
function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
