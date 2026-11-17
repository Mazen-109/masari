import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui badge, adapted to Masari tokens (DESIGN.md "Shapes": badges are `rounded-sm`). A short status
// word on a soft fill with that fill's `-foreground` token; never colour alone.
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-sm font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        info: 'bg-primary-soft text-primary-soft-foreground',
        neutral: 'bg-muted text-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        destructive: 'bg-danger-soft text-danger-soft-foreground',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
