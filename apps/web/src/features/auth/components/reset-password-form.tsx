'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import { ClientLink } from '@/i18n/client-link';
import type { ActionResult } from '@/lib/result';
import { resetPasswordAction } from '../actions';

type ResetPasswordFormProps = Readonly<{
  /** The token of the emailed link; sent back as a hidden field and checked only by the action. */
  token: string;
}>;

/**
 * Choosing a new password from the emailed link (FR-007, FR-010). Works without JavaScript. On success the
 * action redirects to sign-in. When the link turns out to be invalid, expired, or already used
 * (`token_invalid`), the error is followed by a link to request a new one; the password is never echoed.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const tokenInvalid = result?.ok === false && result.code === 'token_invalid' && !pending;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />
      {tokenInvalid ? (
        <ClientLink
          href="/forgot-password"
          className="inline-flex min-h-11 items-center self-start rounded-md font-medium text-primary underline underline-offset-4"
        >
          {t('requestNew')}
        </ClientLink>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Field
        id="reset-password-password"
        label={t('password')}
        hint={t('passwordHint')}
        error={fieldErrors?.password}
      >
        {(control) => (
          <Input
            {...control}
            type="password"
            name="password"
            dir="ltr"
            autoComplete="new-password"
            required
          />
        )}
      </Field>
      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
