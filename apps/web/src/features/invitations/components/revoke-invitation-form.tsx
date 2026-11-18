'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import type { ActionResult } from '@/lib/result';
import { revokeInvitationAction } from '../actions';

/**
 * The revoke button of one pending invitation (FR-022): a form with the invitation's id in a hidden field,
 * so it also works without JavaScript. The button's name ends with the address (visually hidden), so each
 * row's button is distinguishable for screen-reader users. A refusal (`not_found`, `conflict`, …) shows
 * under the button; after a success the list is refreshed and the row shows "revoked".
 *
 * After a `conflict` (the invitation was accepted or revoked meanwhile) the action refreshes the list too:
 * the row then shows its new status and, no longer pending, loses this form — so the `conflict` message
 * may disappear with it. The row's status is what tells the administrator what happened.
 */
export function RevokeInvitationForm({
  invitationId,
  email,
}: Readonly<{ invitationId: string; email: string }>) {
  const t = useTranslations('admin.invitations.list');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    revokeInvitationAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2" data-slot="revoke-form">
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton variant="outline">
        {t('revoke')}
        <span className="sr-only">
          {' '}
          {t.rich('revokeTarget', {
            email,
            bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
          })}
        </span>
      </SubmitButton>
      <FormError result={result} pending={pending} />
    </form>
  );
}
