'use client';

import type { Role } from '@masari/db';
import { useTranslations } from 'next-intl';
import { useActionState, useState, type ReactNode } from 'react';
import { Field } from '@/components/forms/field';
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
import { Select } from '@/components/ui/select';
import type { ActionResult } from '@/lib/result';
import { changeUserRoleAction } from '../actions';
import { useAnnounceAfterClose } from './users-announcer';

/** One role of the picker, already in the current language. */
export type RoleOption = Readonly<{ value: Role; label: string }>;

type Target = Readonly<{ userId: string; name: string; role: Role }>;

/**
 * The form inside the dialog. It is mounted only while the dialog is open, so every opening starts with
 * no error. A success closes the dialog (`onDone`) and the refreshed list shows the new role.
 */
function RoleForm({
  target,
  roles,
  onDone,
}: Readonly<{ target: Target; roles: readonly RoleOption[]; onDone: () => void }>) {
  const t = useTranslations('admin.users.actions.role');
  const tCommon = useTranslations('common.actions');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const next = await changeUserRoleAction(previous, formData);
      if (next.ok) onDone();
      return next;
    },
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6" data-slot="role-form">
      <input type="hidden" name="userId" value={target.userId} />
      <FormError result={result} pending={pending} />
      <Field id={`role-${target.userId}`} label={t('label')} error={fieldErrors?.role}>
        {(control) => (
          <Select {...control} name="role" required defaultValue={target.role}>
            {roles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">{tCommon('cancel')}</Button>
        </DialogClose>
        <SubmitButton>{t('submit')}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * "Change role" of one row of the People screen (FR-030): a dialog with the four roles, the current one
 * selected. The trigger's accessible name ends with the person's name (visually hidden) so every row's
 * button is distinct. Focus is trapped in the dialog, Escape closes it, and focus returns to the trigger;
 * a success is announced in the list's live region (UsersAnnouncer) once the dialog has closed. Needs
 * JavaScript (the dialog); refusals show inside the dialog.
 */
export function RoleDialog({
  userId,
  name,
  role,
  roles,
}: Readonly<{ userId: string; name: string; role: Role; roles: readonly RoleOption[] }>) {
  const t = useTranslations('admin.users.actions.role');
  const tCommon = useTranslations('common.actions');
  const [open, setOpen] = useState(false);
  const announcement = useAnnounceAfterClose();
  const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

  function handleDone(): void {
    setOpen(false);
    announcement.later(t('done'));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="compact" data-slot="role-trigger">
          {t('open')}
          <span className="sr-only"> {t.rich('target', { name, bdi })}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={tCommon('close')}
        data-slot="role-dialog"
        // Focus still returns to the trigger (no preventDefault); the success is announced once closed.
        onCloseAutoFocus={announcement.closed}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t.rich('description', { name, bdi })}</DialogDescription>
        </DialogHeader>
        <RoleForm target={{ userId, name, role }} roles={roles} onDone={handleDone} />
      </DialogContent>
    </Dialog>
  );
}
