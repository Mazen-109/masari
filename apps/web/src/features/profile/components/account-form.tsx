'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { updateAccountAction } from '../actions';
import { SavedStatus } from './saved-status';

type AccountFormProps = Readonly<{ name: string; email: string }>;

/**
 * The account part of the profile screen (FR-027): the name, which every user may change, and the email,
 * shown read-only (`dir="ltr"`, not submitted). Works without JavaScript; after a failure the action
 * echoes the entered name, which becomes the field's default value.
 */
export function AccountForm({ name, email }: AccountFormProps) {
  const t = useTranslations('profile.account');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateAccountAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const echoed = result?.ok === false ? result.meta?.name : undefined;
  const value = typeof echoed === 'string' ? echoed : name;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />
      <SavedStatus result={result} pending={pending} />

      <Field id="account-name" label={t('name')} error={fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            // Remounts with the saved (or echoed) name, so the field never keeps a stale value.
            key={value}
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            defaultValue={value}
          />
        )}
      </Field>

      <Field id="account-email" label={t('email')} hint={t('emailReadOnly')}>
        {(control) => <Input {...control} type="email" dir="ltr" readOnly value={email} />}
      </Field>

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
