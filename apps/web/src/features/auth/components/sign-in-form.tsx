'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import { signInAction } from '../actions';
import { ResendVerificationForm } from './resend-verification-form';

type SignInFormProps = Readonly<{
  /** The page's `next` after `safeNext`; sent back as a hidden field. */
  next: string | null;
}>;

/** The email the action echoed back after a failure (`meta.email`; never the password). */
function enteredEmail(result: ActionResult | null): string {
  const value = result?.ok === false ? result.meta?.email : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Sign-in form (FR-006). Works without JavaScript (the Server Action posts natively and the page is
 * rendered from its result). Every refusal is one form-level message: a wrong password and an unknown
 * address get the same `invalid_credentials` text. For an unconfirmed address the "send the confirmation
 * email again" form appears below (a separate form: forms cannot be nested), prefilled with the address.
 */
export function SignInForm({ next }: SignInFormProps) {
  const t = useTranslations('auth.signIn');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    signInAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const email = enteredEmail(result);
  const notVerified = result?.ok === false && result.code === 'email_not_verified' && !pending;

  return (
    <>
      <form action={formAction} noValidate className="flex flex-col gap-6">
        <FormError result={result} pending={pending} />
        {next === null ? null : <input type="hidden" name="next" value={next} />}

        <Field id="sign-in-email" label={t('email')} error={fieldErrors?.email}>
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              required
              defaultValue={email}
            />
          )}
        </Field>

        <Field id="sign-in-password" label={t('password')} error={fieldErrors?.password}>
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              dir="ltr"
              autoComplete="current-password"
              required
            />
          )}
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SubmitButton className="w-full sm:w-auto">{t('submit')}</SubmitButton>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4"
          >
            {t('forgotPassword')}
          </Link>
        </div>
      </form>

      {notVerified ? (
        <div className="mt-10 border-t border-border pt-8">
          <ResendVerificationForm id="sign-in-resend" defaultEmail={email} />
        </div>
      ) : null}
    </>
  );
}
