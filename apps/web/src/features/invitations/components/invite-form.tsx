'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ActionResult } from '@/lib/result';
import { createInvitationAction } from '../actions';

/** One role of the picker, already in the current language. */
export type RoleOption = Readonly<{ value: string; label: string }>;

/** A value the action echoed back after a failure (`meta.<field>`). */
function entered(result: ActionResult | null, key: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * The invite form of the invitations screen (FR-020): the invitee's email (`dir="ltr"`) and one of the
 * four roles. Works without JavaScript; after a failure the action echoes the entered values, which become
 * the controls' default values, and after a success the form is empty again and a status banner says the
 * invitation was sent. "Has an account" and "already invited" share one message.
 */
export function InviteForm({ roles }: Readonly<{ roles: readonly RoleOption[] }>) {
  const t = useTranslations('admin.invitations.form');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createInvitationAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const email = entered(result, 'email');
  const enteredRole = entered(result, 'role').trim();
  const role = roles.some((option) => option.value === enteredRole) ? enteredRole : '';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />
      {!pending && result?.ok === true ? (
        <Alert variant="success" role="status" data-slot="invite-sent">
          {t('sent')}
        </Alert>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="invite-email"
          label={t('email')}
          hint={t('emailHint')}
          error={fieldErrors?.email}
          errorMessage={
            fieldErrors?.email === 'email_unavailable' ? t('emailUnavailable') : undefined
          }
        >
          {(control) => (
            <Input
              key={`email-${email}`}
              {...control}
              name="email"
              type="email"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={254}
              defaultValue={email}
            />
          )}
        </Field>

        <Field id="invite-role" label={t('role')} error={fieldErrors?.role}>
          {(control) => (
            <Select key={`role-${role}`} {...control} name="role" required defaultValue={role}>
              <option value="">{t('rolePlaceholder')}</option>
              {roles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
