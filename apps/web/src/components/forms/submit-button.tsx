'use client';

import { useTranslations } from 'next-intl';
import type { ComponentProps, MouseEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, 'type' | 'asChild'>;

/**
 * The submit button of a form (FR-042). While the form is being sent (`useFormStatus`) it says so
 * (`common.actions.pending`), is marked `aria-disabled` and `aria-busy`, and ignores further clicks — it
 * stays focusable instead of being `disabled`, so keyboard focus is not lost. Without JavaScript it is a
 * plain submit button.
 */
export function SubmitButton({ children, onClick, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const t = useTranslations('common.actions');

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <Button
      {...props}
      type="submit"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={handleClick}
    >
      {pending ? t('pending') : children}
    </Button>
  );
}
