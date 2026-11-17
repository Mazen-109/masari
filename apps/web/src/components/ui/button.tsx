import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui button (new-york), adapted to Masari tokens (DESIGN.md "Buttons"): logical utilities only,
// 44 px minimum target, the global 2 px focus ring, no shadows.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-base font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-70 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70',
        outline: 'border border-input bg-surface text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-danger text-danger-foreground hover:bg-danger-hover',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-5 py-2',
        lg: 'min-h-12 px-6 py-2 text-lg',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (e.g. a link) with button styles instead of a `<button>`. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));
  if (asChild) {
    return <Slot data-slot="button" className={classes} {...props} />;
  }
  // `type="button"` by default so a button inside a form never submits it by accident; submit
  // buttons say `type="submit"` explicitly.
  return <button data-slot="button" type={type ?? 'button'} className={classes} {...props} />;
}

export { Button, buttonVariants };
