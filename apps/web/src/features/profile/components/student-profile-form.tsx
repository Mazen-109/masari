'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ActionResult } from '@/lib/result';
import { completeStudentProfileAction, updateStudentProfileAction } from '../actions';
import { SavedStatus } from './saved-status';

/** One option of a picker, already in the current language. */
export type ChoiceOption = Readonly<{ value: string; label: string }>;

/** The saved profile shown by the profile screen (edit mode). */
export type CurrentProfile = Readonly<{ studentCode: string; level: number; divisionId: string }>;

type StudentProfileFormProps = Readonly<{
  /** Levels 1…the college's number of levels, labelled «الفرقة الأولى…». */
  levels: readonly ChoiceOption[];
  /**
   * The college's active divisions, named in the current language; in edit mode also the student's
   * current division even when it was deactivated since (FR-026).
   */
  divisions: readonly ChoiceOption[];
  /**
   * Edit mode (profile screen): the saved profile. The student code is shown as text, never as a control
   * (FR-025), and the form changes only level and division (`updateStudentProfileAction`). Without it the
   * form creates the profile (onboarding, `completeStudentProfileAction`).
   */
  current?: CurrentProfile;
}>;

/** A value the action echoed back after a failure (`meta.<field>`). */
function entered(result: ActionResult | null, key: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : '';
}

/** The echoed choice, only when it is still one of the options (otherwise the placeholder). */
function enteredChoice(
  result: ActionResult | null,
  key: string,
  options: readonly ChoiceOption[],
): string {
  const value = entered(result, key).trim().toLowerCase();
  return options.some((option) => option.value === value) ? value : '';
}

/**
 * The academic profile form (FR-024–FR-027). On the onboarding step it creates the profile: student code
 * (Latin letters, digits, hyphens — `dir="ltr"`), level, and division. On the profile screen (`current`)
 * it shows the code read-only and changes level and division, starting from the saved values. Works
 * without JavaScript; after a failure the action echoes the entered values, which become the controls'
 * default values.
 */
export function StudentProfileForm({ levels, divisions, current }: StudentProfileFormProps) {
  const t = useTranslations('onboarding');
  const tProfile = useTranslations('profile.academic');
  const editing = current !== undefined;
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    editing ? updateStudentProfileAction : completeStudentProfileAction,
    null,
  );
  const failed = result?.ok === false;
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const level =
    failed || current === undefined
      ? enteredChoice(result, 'level', levels)
      : String(current.level);
  const division =
    failed || current === undefined
      ? enteredChoice(result, 'divisionId', divisions)
      : current.divisionId;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />
      {editing ? <SavedStatus result={result} pending={pending} /> : null}

      {current === undefined ? (
        <Field
          id="profile-student-code"
          label={t('studentCode')}
          hint={t('studentCodeHint')}
          error={fieldErrors?.studentCode}
          // US2 scenario 3: say the code is in use and whom to contact (the shared text says only the first).
          errorMessage={
            fieldErrors?.studentCode === 'student_code_taken' ? t('studentCodeTaken') : undefined
          }
        >
          {(control) => (
            <Input
              {...control}
              name="studentCode"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={20}
              defaultValue={entered(result, 'studentCode')}
            />
          )}
        </Field>
      ) : (
        // Read-only (FR-025): text, not a control, so it is never part of the submission.
        <dl className="flex flex-col gap-2" data-slot="student-code">
          <dt className="font-medium">{t('studentCode')}</dt>
          <dd className="flex flex-col gap-1">
            <bdi dir="ltr" className="font-medium" data-field="studentCode">
              {current.studentCode}
            </bdi>
            <span className="text-sm text-muted-foreground">{tProfile('studentCodeReadOnly')}</span>
          </dd>
        </dl>
      )}

      <Field id="profile-level" label={t('level')} error={fieldErrors?.level}>
        {(control) => (
          <Select key={`level-${level}`} {...control} name="level" required defaultValue={level}>
            <option value="">{t('levelPlaceholder')}</option>
            {levels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="profile-division" label={t('division')} error={fieldErrors?.divisionId}>
        {(control) => (
          <Select
            key={`division-${division}`}
            {...control}
            name="divisionId"
            required
            defaultValue={division}
          >
            <option value="">{t('divisionPlaceholder')}</option>
            {divisions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <SubmitButton className="w-full sm:w-auto sm:self-start">
        {editing ? tProfile('submit') : t('submit')}
      </SubmitButton>
    </form>
  );
}
