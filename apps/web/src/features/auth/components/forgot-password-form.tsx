'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { requestPasswordResetAction } from '../actions';

/** The email the action echoed back after a failure (`meta.email`). */
function enteredEmail(result: ActionResult | null): string {
  const value = result?.ok === false ? result.meta?.email : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * "Forgot your password?" (FR-005, FR-010). Works without JavaScript. After a successful request it always
 * shows the same sentence — whether or not the address has an account — so it never reveals whether the
 * address is registered. The sentence is removed while a request is pending and inserted again when it
 * succeeds, so every successful request is announced. Errors (validation, rate limit with the retry time)
 * are shown by `FormError` and on the field.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    requestPasswordResetAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const sent = result?.ok === true && !pending;

  return (
    <>
      {/* Always rendered (empty, it takes no space), so screen readers announce the inserted sentence. */}
      <div role="status" data-slot="form-status" className="not-empty:mb-6">
        {sent ? <Alert variant="success">{t('sent')}</Alert> : null}
      </div>
      <form action={formAction} noValidate className="flex flex-col gap-6">
        <FormError result={result} pending={pending} />
        <Field id="forgot-password-email" label={t('email')} error={fieldErrors?.email}>
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
    </>
  );
}
