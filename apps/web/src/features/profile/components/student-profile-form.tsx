'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ActionResult } from '@/lib/result';
import { completeStudentProfileAction } from '../actions';

/** One option of a picker, already in the current language. */
export type ChoiceOption = Readonly<{ value: string; label: string }>;

type StudentProfileFormProps = Readonly<{
  /** Levels 1…the college's number of levels, labelled «الفرقة الأولى…». */
  levels: readonly ChoiceOption[];
  /** The college's active divisions, named in the current language. */
  divisions: readonly ChoiceOption[];
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
 * The academic profile form of the onboarding step (FR-024–FR-026): student code (Latin letters, digits,
 * hyphens — `dir="ltr"`), level, and division. Works without JavaScript; after a failure the action echoes
 * the entered values, which become the controls' default values.
 */
export function StudentProfileForm({ levels, divisions }: StudentProfileFormProps) {
  const t = useTranslations('onboarding');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    completeStudentProfileAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const level = enteredChoice(result, 'level', levels);
  const division = enteredChoice(result, 'divisionId', divisions);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />

      <Field
        id="profile-student-code"
        label={t('studentCode')}
        hint={t('studentCodeHint')}
        error={fieldErrors?.studentCode}
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

      <Field id="profile-level" label={t('level')} error={fieldErrors?.level}>
        {(control) => (
          <Select {...control} key={`level-${level}`} name="level" required defaultValue={level}>
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
            {...control}
            key={`division-${division}`}
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

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
