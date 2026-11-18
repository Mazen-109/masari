'use client';

import type { UserStatus } from '@masari/db';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ActionResult } from '@/lib/result';
import { setUserStatusAction } from '../actions';

function bdi(chunks: ReactNode) {
  return <bdi>{chunks}</bdi>;
}

/** Runs the status action and reports a success to `onDone` (the dialog closes, the change is announced). */
function useStatusAction(onDone: () => void) {
  return useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    const next = await setUserStatusAction(previous, formData);
    if (next.ok) onDone();
    return next;
  }, null);
}

/** The confirmation form inside the suspend dialog; mounted only while the dialog is open. */
function SuspendForm({ userId, onDone }: Readonly<{ userId: string; onDone: () => void }>) {
  const t = useTranslations('admin.users.actions.suspend');
  const tCommon = useTranslations('common.actions');
  const [result, formAction, pending] = useStatusAction(onDone);

  return (
    <form action={formAction} className="flex flex-col gap-6" data-slot="suspend-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value="suspended" />
      <FormError result={result} pending={pending} />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">{tCommon('cancel')}</Button>
        </DialogClose>
        <SubmitButton variant="destructive">{t('submit')}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/** "Suspend": a confirmation dialog first, because suspending signs the person out everywhere. */
function SuspendDialog({
  userId,
  name,
  buttonRef,
  onDone,
}: Readonly<{
  userId: string;
  name: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onDone: () => void;
}>) {
  const t = useTranslations('admin.users.actions.suspend');
  const tCommon = useTranslations('common.actions');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button ref={buttonRef} variant="outline" data-slot="suspend-trigger">
          {t('open')}
          <span className="sr-only"> {t.rich('target', { name, bdi })}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={tCommon('close')}
        data-slot="suspend-dialog"
        // After a suspension the trigger is replaced by "Reactivate": focus goes to whichever button is there.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          buttonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t.rich('description', { name, bdi })}</DialogDescription>
        </DialogHeader>
        <SuspendForm
          userId={userId}
          onDone={() => {
            setOpen(false);
            onDone();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** "Reactivate": a plain form, no confirmation — reactivating takes nothing away. */
function ReactivateForm({
  userId,
  name,
  buttonRef,
  onDone,
}: Readonly<{
  userId: string;
  name: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onDone: () => void;
}>) {
  const t = useTranslations('admin.users.actions.reactivate');
  const [result, formAction, pending] = useStatusAction(onDone);

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      data-slot="reactivate-form"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value="active" />
      <SubmitButton ref={buttonRef} variant="outline">
        {t('submit')}
        <span className="sr-only"> {t.rich('target', { name, bdi })}</span>
      </SubmitButton>
      <FormError result={result} pending={pending} />
    </form>
  );
}

/**
 * Suspend or reactivate one row's account (FR-031). An active account gets "Suspend", which asks for
 * confirmation in a dialog (focus trapped, Escape closes); a suspended one gets "Reactivate". Each button's
 * accessible name ends with the person's name (visually hidden). When the status changes the button is
 * replaced, so focus moves to the new one, and the change is announced politely.
 */
export function StatusButton({
  userId,
  name,
  status,
}: Readonly<{ userId: string; name: string; status: UserStatus }>) {
  const t = useTranslations('admin.users.actions');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  // The refreshed list swaps the button: keep keyboard focus on the row's status control.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    buttonRef.current?.focus();
  }, [status]);

  function done(message: string): void {
    refocus.current = true;
    setAnnouncement(message);
  }

  return (
    <>
      {status === 'active' ? (
        <SuspendDialog
          userId={userId}
          name={name}
          buttonRef={buttonRef}
          onDone={() => done(t('suspend.done'))}
        />
      ) : (
        <ReactivateForm
          userId={userId}
          name={name}
          buttonRef={buttonRef}
          onDone={() => done(t('reactivate.done'))}
        />
      )}
      <p role="status" className="sr-only" data-slot="status-announcement">
        {announcement}
      </p>
    </>
  );
}
