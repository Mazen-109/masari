import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui textarea (new-york), adapted like `Input`: `input` border, `surface` fill, 16 px text, the
// global focus ring, `danger` border when `aria-invalid`. Resizes vertically only.
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-28 w-full min-w-0 resize-y rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
