'use client';

import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { resendVerificationAction } from '../actions';
import type { ResendLabels } from '../labels';

type ResendVerificationFormProps = Readonly<{
  /** The texts, translated by the page (`getResendLabels`). */
  labels: ResendLabels;
  /** Id of the control; also prefixes the heading and error ids. Unique per page. */
  id?: string;
  /** Initial value of the email field (e.g. the address just used on the sign-in form). */
  defaultEmail?: string;
}>;

/** The email the action echoed back after a failure (`meta.email`), else the given default. */
function enteredEmail(result: ActionResult | null, fallback: string): string {
  const value = result?.ok === false ? result.meta?.email : undefined;
  return typeof value === 'string' ? value : fallback;
}

/**
 * "Send the confirmation email again" (FR-004, FR-005). Works without JavaScript. After a successful
 * request it always shows the same sentence — whether or not an account needs confirmation — so it never
 * reveals whether the address is registered. The sentence is removed while a request is pending and
 * inserted again when it succeeds, so every successful request is announced. Errors (validation, rate
 * limit with the retry time) are shown by `FormError` and on the field.
 */
export function ResendVerificationForm({
  labels,
  id = 'resend-email',
  defaultEmail = '',
}: ResendVerificationFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    resendVerificationAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const sent = result?.ok === true && !pending;

  return (
    <form
      action={formAction}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {labels.title}
      </h2>
      <div>
        <p className="text-muted-foreground">{labels.lead}</p>
        {/* The live region is always rendered and displayed (empty, it takes no space), so screen
            readers announce the sentence when it is inserted. */}
        <div role="status" data-slot="form-status">
          {sent ? <p className="mt-4 font-medium">{labels.sent}</p> : null}
        </div>
      </div>
      <FormError result={result} pending={pending} />
      <Field id={id} label={labels.email} error={fieldErrors?.email}>
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            dir="ltr"
            autoComplete="email"
            required
            defaultValue={enteredEmail(result, defaultEmail)}
          />
        )}
      </Field>
      <SubmitButton className="w-full sm:w-auto sm:self-start">{labels.submit}</SubmitButton>
    </form>
  );
}
