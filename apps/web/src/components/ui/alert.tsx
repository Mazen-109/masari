import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui alert, adapted to Masari tokens (DESIGN.md "Status"): a `rounded-lg` banner on a soft status
// fill; the colour is always paired with words. The caller chooses the role: `alert` for errors that
// must be announced, `status` for information.
const alertVariants = cva('w-full rounded-lg border px-4 py-3 text-base', {
  variants: {
    variant: {
      info: 'border-primary-soft bg-primary-soft text-primary-soft-foreground',
      success: 'border-success-soft bg-success-soft text-success',
      warning: 'border-warning-soft bg-warning-soft text-warning',
      destructive: 'border-danger bg-danger-soft text-danger-soft-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="alert-title" className={cn('font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('mt-1', className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
