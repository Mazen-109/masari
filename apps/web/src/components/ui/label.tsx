import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui label, adapted: a native `<label>` (no Radix dependency) in the label type style of DESIGN.md
// (14 px, medium weight). Always visible; callers tie it to its control with `htmlFor`.
function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}

export { Label };
