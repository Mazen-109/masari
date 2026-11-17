import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui card, adapted to Masari tokens (DESIGN.md "Elevation & Depth"): a `surface` sheet with a
// `border` rule line and a `rounded-lg` corner, no shadow. Logical utilities only.
function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-lg border border-border bg-surface py-6 text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-6', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-title" className={cn('text-xl font-semibold', className)} {...props} />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-base text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-3 px-6', className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
