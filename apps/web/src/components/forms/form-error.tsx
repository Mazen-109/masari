import { Alert } from '@/components/ui/alert';
import { retryAfterText } from '@/lib/form-messages';
import type { ActionResult } from '@/lib/result';
import { retryAfterMinutes } from '@/lib/retry-after';
import { useFormMessages } from './form-messages-context';

type FormErrorProps = Readonly<{
  /** The form action's last result (`useActionState`); nothing is shown unless it is a failure. */
  result: ActionResult<unknown> | null | undefined;
  /**
   * True while the form's next request is being sent (`useActionState`). The previous error is removed
   * meanwhile, so the same error coming back (e.g. `rate_limited` twice) is inserted, and announced, again.
   */
  pending?: boolean;
  className?: string;
}>;

/**
 * Form-level error summary (FR-042, contracts/routes.md §7): a `role="alert"` banner with the translated
 * `ErrorCode` (`errors` namespace). For `rate_limited` it adds when the user may try again
 * (`common.retryAfter`), in whole minutes written with Western digits (FR-041).
 */
export function FormError({ result, pending = false, className }: FormErrorProps) {
  const messages = useFormMessages();
  if (pending || result === null || result === undefined || result.ok) return null;

  const minutes =
    result.code === 'rate_limited' ? retryAfterMinutes(result.retryAfterSeconds) : null;

  return (
    <Alert
      variant="destructive"
      role="alert"
      data-slot="form-error"
      data-code={result.code}
      className={className}
    >
      <p>{messages.errors[result.code]}</p>
      {minutes !== null && <p className="mt-1">{retryAfterText(messages, minutes)}</p>}
    </Alert>
  );
}
