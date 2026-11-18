'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import { acceptInvitationAction } from '../actions';

type AcceptInvitationFormProps = Readonly<{
  /** The token of the invitation link; sent back as a hidden field and checked only by the action. */
  token: string;
}>;

/** A value the action echoed back after a failure (`meta.<field>`; never the password). */
function entered(result: ActionResult | null, key: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Accepting an invitation (FR-011, FR-020, FR-021): name, password, and privacy consent. The email address
 * and the role come from the invitation, never from this form. Works without JavaScript; on success the
 * action redirects to sign-in. After a failure the name and consent are filled in again; the password is
 * never echoed. A link that turned out to be no longer valid (`token_invalid`) is explained by the error
 * summary.
 */
export function AcceptInvitationForm({ token }: AcceptInvitationFormProps) {
  const t = useTranslations('auth.invite');
  const tCommon = useTranslations('common');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    acceptInvitationAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const consent = entered(result, 'consent') === 'on';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />
      <input type="hidden" name="token" value={token} />

      <Field id="invite-name" label={t('name')} error={fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="name"
            required
            defaultValue={entered(result, 'name')}
          />
        )}
      </Field>

      <Field
        id="invite-password"
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

      <Field
        id="invite-consent"
        layout="inline"
        label={t.rich('consent', {
          link: (chunks) => (
            // A new tab, so the form keeps what was typed while the notice is read.
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="text-primary underline underline-offset-4"
            >
              {chunks}
              <span className="sr-only">{tCommon('opensInNewTab')}</span>
            </Link>
          ),
        })}
        error={fieldErrors?.consent}
      >
        {(control) => (
          <Checkbox
            {...control}
            key={`consent-${String(consent)}`}
            name="consent"
            required
            defaultChecked={consent}
          />
        )}
      </Field>

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
