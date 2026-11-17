'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { resendVerificationAction } from '../actions';

type ResendVerificationFormProps = Readonly<{
  /** `missing`: the email may not have arrived ("check your email"). `invalid`: the link did not work. */
  variant?: 'missing' | 'invalid';
  /** Id of the control; also prefixes the heading, hint, and error ids. Unique per page. */
  id?: string;
}>;

/** The email the action echoed back after a failure (`meta.email`). */
function enteredEmail(result: ActionResult | null): string {
  const value = result?.ok === false ? result.meta?.email : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * "Send the confirmation email again" (FR-004, FR-005). Works without JavaScript. After a successful
 * request it always shows the same sentence — whether or not an account needs confirmation — so it never
 * reveals whether the address is registered. Errors (validation, rate limit with the retry time) are shown
 * by `FormError` and on the field.
 */
export function ResendVerificationForm({
  variant = 'missing',
  id = 'resend-email',
}: ResendVerificationFormProps) {
  const t = useTranslations('auth.resend');
  const [result, formAction] = useActionState<ActionResult | null, FormData>(
    resendVerificationAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const sent = result?.ok === true;

  return (
    <form
      action={formAction}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {variant === 'missing' ? t('titleMissing') : t('titleInvalid')}
      </h2>
      <p className="text-muted-foreground">{t('lead')}</p>
      <FormError result={result} />
      {/* Always rendered, so screen readers announce the sentence when it appears. */}
      <p role="status" data-slot="form-status" className="font-medium empty:hidden">
        {sent ? t('sent') : null}
      </p>
      <Field id={id} label={t('email')} error={fieldErrors?.email}>
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            dir="ltr"
            autoComplete="email"
            required
            defaultValue={enteredEmail(result)}
          />
        )}
      </Field>
      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
