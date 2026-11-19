'use client';

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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type {
  ChoiceOption,
  CurrentProfile,
} from '@/features/profile/components/student-profile-form';
import type { ActionResult } from '@/lib/result';
import { adminUpdateStudentProfileAction } from '../actions';
import { useAnnounceAfterClose } from './users-announcer';

type Target = Readonly<{
  userId: string;
  /** The saved profile; null while the student has not completed it (the dialog then creates it). */
  current: CurrentProfile | null;
  levels: readonly ChoiceOption[];
  /** The college's active divisions, plus the student's current one even when it was deactivated since. */
  divisions: readonly ChoiceOption[];
}>;

/** A value the action echoed back after a failure (`meta.<field>`); null when there is none. */
function entered(result: ActionResult | null, key: string): string | null {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : null;
}

/** The echoed choice when it is still one of the options; otherwise `fallback`. */
function choice(
  result: ActionResult | null,
  key: string,
  options: readonly ChoiceOption[],
  fallback: string,
): string {
  const value = entered(result, key)?.trim().toLowerCase();
  if (value === undefined) return fallback;
  return options.some((option) => option.value === value) ? value : '';
}

/**
 * The form inside the dialog, mounted only while it is open, so every opening starts from the saved
 * values with no error. The three fields have the labels and rules of the student's own profile form
 * (StudentProfileForm); unlike the student, the administrator may correct the code. After a failure the
 * entered values are shown again (React resets an uncontrolled form after its action), and a success
 * closes the dialog (`onDone`) — the refreshed list shows the change.
 */
function StudentProfileDialogForm({
  target,
  onDone,
}: Readonly<{ target: Target; onDone: () => void }>) {
  const t = useTranslations('admin.users.actions.profile');
  const tFields = useTranslations('onboarding');
  const tCommon = useTranslations('common.actions');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const next = await adminUpdateStudentProfileAction(previous, formData);
      if (next.ok) onDone();
      return next;
    },
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const { current } = target;
  const studentCode = entered(result, 'studentCode') ?? current?.studentCode ?? '';
  const level = choice(result, 'level', target.levels, current ? String(current.level) : '');
  const division = choice(result, 'divisionId', target.divisions, current?.divisionId ?? '');
  const id = (field: string) => `student-${field}-${target.userId}`;

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-6"
      data-slot="student-profile-form"
    >
      <input type="hidden" name="userId" value={target.userId} />
      <FormError result={result} pending={pending} />

      <Field
        id={id('code')}
        label={tFields('studentCode')}
        hint={t('studentCodeHint')}
        error={fieldErrors?.studentCode}
      >
        {(control) => (
          <Input
            key={`code-${studentCode}`}
            {...control}
            name="studentCode"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={20}
            defaultValue={studentCode}
          />
        )}
      </Field>

      <Field id={id('level')} label={tFields('level')} error={fieldErrors?.level}>
        {(control) => (
          <Select key={`level-${level}`} {...control} name="level" required defaultValue={level}>
            <option value="">{t('levelPlaceholder')}</option>
            {target.levels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id={id('division')} label={tFields('division')} error={fieldErrors?.divisionId}>
        {(control) => (
          <Select
            key={`division-${division}`}
            {...control}
            name="divisionId"
            required
            defaultValue={division}
          >
            <option value="">{t('divisionPlaceholder')}</option>
            {target.divisions.map((option) => (
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
 * "Academic data" of a student's row on the People screen (FR-028, US6 scenario 5): a dialog to correct
 * the student code, level, and division — or to enter them when the student has not yet. Same trigger
 * style as the other row actions (compact, the person's name visually hidden in its accessible name).
 * Focus is trapped in the dialog, Escape closes it, and focus returns to the trigger; a success is
 * announced in the list's live region (UsersAnnouncer) once the dialog has closed. Needs JavaScript (the
 * dialog); refusals show inside the dialog.
 */
export function StudentProfileDialog({
  userId,
  name,
  current,
  levels,
  divisions,
}: Readonly<{ name: string } & Target>) {
  const t = useTranslations('admin.users.actions.profile');
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
        <Button variant="outline" size="compact" data-slot="student-profile-trigger">
          {t('open')}
          <span className="sr-only"> {t.rich('target', { name, bdi })}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={tCommon('close')}
        data-slot="student-profile-dialog"
        // Focus still returns to the trigger (no preventDefault); the success is announced once closed.
        onCloseAutoFocus={announcement.closed}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t.rich('description', { name, bdi })}</DialogDescription>
        </DialogHeader>
        <StudentProfileDialogForm
          target={{ userId, current, levels, divisions }}
          onDone={handleDone}
        />
      </DialogContent>
    </Dialog>
  );
}
