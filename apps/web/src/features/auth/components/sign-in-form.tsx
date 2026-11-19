'use client';

import { useActionState, type ReactNode } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { signInAction } from '../actions';
import type { ResendLabels, SignInLabels } from '../labels';
import { ResendVerificationForm } from './resend-verification-form';

type SignInFormProps = Readonly<{
  /** The page's `next` after `safeNext`; sent back as a hidden field. */
  next: string | null;
  /**
   * The "forgot your password?" link beside the button, rendered by the (server) page, so this
   * component's script does not carry a copy of `next/link` (PR-40).
   */
  forgotPasswordLink: ReactNode;
  /** The texts, translated by the page, so this form loads no next-intl client code (PR-40). */
  labels: SignInLabels;
  /** The texts of the "send the confirmation email again" form shown for an unconfirmed address. */
  resendLabels: ResendLabels;
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
export function SignInForm({ next, forgotPasswordLink, labels, resendLabels }: SignInFormProps) {
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

        <Field id="sign-in-email" label={labels.email} error={fieldErrors?.email}>
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

        <Field id="sign-in-password" label={labels.password} error={fieldErrors?.password}>
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
          <SubmitButton className="w-full sm:w-auto">{labels.submit}</SubmitButton>
          {forgotPasswordLink}
        </div>
      </form>

      {notVerified ? (
        <div className="mt-10 border-t border-border pt-8">
          <ResendVerificationForm id="sign-in-resend" defaultEmail={email} labels={resendLabels} />
        </div>
      ) : null}
    </>
  );
}
