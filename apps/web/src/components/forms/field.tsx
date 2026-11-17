import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import type { FieldErrorCode } from '@/lib/result';
import { cn } from '@/lib/utils';

/** Props the field hands to its control: spread them on the `<input>`, `<select>`, or checkbox. */
export type FieldControlProps = {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
};

type FieldProps = Readonly<{
  /** Visible label text; always rendered (contracts/routes.md §7). */
  label: ReactNode;
  /** Optional help text under the control. */
  hint?: ReactNode;
  /** Field error code from `ActionFailure.fieldErrors`; translated from the `errors` namespace. */
  error?: FieldErrorCode | null;
  /**
   * Replaces the generic translation of `error` when a screen needs to say more (e.g. what to do next).
   * Used only while there is an error.
   */
  errorMessage?: ReactNode;
  /** Control id; generated when omitted. The hint and error ids derive from it. */
  id?: string;
  /** `stacked` (default): label above the control. `inline`: control then label on one row (checkbox). */
  layout?: 'stacked' | 'inline';
  className?: string;
  /** Renders the control with the wiring props. */
  children: (control: FieldControlProps) => ReactNode;
}>;

/**
 * One form field (FR-042, DESIGN.md "Inputs / Fields"): a visible label tied to the control, an optional
 * hint, and the error text in `danger` below. The control gets `aria-invalid="true"` when there is an
 * error and `aria-describedby` pointing at the error (first) and the hint, so assistive technology reads
 * them with the field.
 */
export function Field({
  label,
  hint,
  error,
  errorMessage,
  id,
  layout = 'stacked',
  className,
  children,
}: FieldProps) {
  const t = useTranslations('errors');
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const hasError = error !== undefined && error !== null;
  const hasHint = hint !== undefined && hint !== null;

  const describedBy = [hasError ? errorId : null, hasHint ? hintId : null].filter(
    (value): value is string => value !== null,
  );
  const control = children({
    id: controlId,
    'aria-invalid': hasError ? true : undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
  });

  const hintElement = hasHint ? (
    <p id={hintId} className="text-sm text-muted-foreground">
      {hint}
    </p>
  ) : null;
  const errorElement = hasError ? (
    <p id={errorId} className="text-sm font-medium text-danger">
      {errorMessage ?? t(error)}
    </p>
  ) : null;

  if (layout === 'inline') {
    return (
      <div data-slot="field" className={cn('flex flex-col gap-1', className)}>
        <div className="flex min-h-11 items-center gap-3">
          {control}
          <Label htmlFor={controlId} className="text-base font-normal">
            {label}
          </Label>
        </div>
        {hintElement}
        {errorElement}
      </div>
    );
  }

  return (
    <div data-slot="field" className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
      {hintElement}
      {errorElement}
    </div>
  );
}
