import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui input (new-york), adapted to Masari tokens (DESIGN.md "Inputs / Fields"): `input` border,
// `surface` fill, 44 px minimum height, 16 px text, the global focus ring, `danger` border when
// `aria-invalid`. Logical utilities only.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex min-h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
