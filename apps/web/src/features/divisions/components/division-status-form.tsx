'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import type { ActionResult } from '@/lib/result';
import { setDivisionActiveAction } from '../actions';

const ltr = (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>;

/**
 * "Deactivate" or "Reactivate" of one row of the divisions table (FR-033): a plain form with the division's
 * id and the new state in hidden fields, so it also works without JavaScript. No confirmation: neither
 * direction removes anything — a deactivated division stays on the profiles of the students who have it and
 * can be reactivated. The button's accessible name ends with the division's code (visually hidden). When
 * the state changes the refreshed row swaps the button, focus stays on it, and the change is announced.
 */
export function DivisionStatusForm({
  divisionId,
  code,
  isActive,
}: Readonly<{ divisionId: string; code: string; isActive: boolean }>) {
  const t = useTranslations('admin.divisions.actions');
  const key = isActive ? 'deactivate' : 'activate';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const [announcement, setAnnouncement] = useState('');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const next = await setDivisionActiveAction(previous, formData);
      if (next.ok) {
        refocus.current = true;
        setAnnouncement(t(`${key}.done`));
      }
      return next;
    },
    null,
  );

  // The refreshed list changes the button's word: keep keyboard focus on it.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    buttonRef.current?.focus();
  }, [isActive]);

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      data-slot="division-status-form"
    >
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
      <SubmitButton ref={buttonRef} variant="outline" size="compact">
        {t(`${key}.submit`)}
        <span className="sr-only"> {t.rich(`${key}.target`, { code, ltr })}</span>
      </SubmitButton>
      <FormError result={result} pending={pending} />
      <p role="status" className="sr-only" data-slot="division-status-announcement">
        {announcement}
      </p>
    </form>
  );
}
