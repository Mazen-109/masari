'use client';

import { useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/result';
import { createDivisionAction, updateDivisionAction } from '../actions';

/** A division as the edit form starts from it. */
export type EditableDivision = Readonly<{
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}>;

type DivisionFormProps = Readonly<
  | { mode: 'create' }
  | {
      mode: 'edit';
      division: EditableDivision;
      /** Called after a successful save (the dialog closes). */
      onDone: () => void;
      /** The dialog's cancel and submit row. */
      footer: (submit: ReactNode) => ReactNode;
    }
>;

/** A value the action echoed back after a failure (`meta.<field>`), else `fallback`. */
function shown(result: ActionResult | null, key: string, fallback: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : fallback;
}

/**
 * The division form (FR-033). `create`: code (`dir="ltr"`, stored upper-case), Arabic name (`dir="rtl"`),
 * English name (`dir="ltr"`), and display order; works without JavaScript, and after a success it is empty
 * again under a status banner. `edit` (inside the row's dialog): the same fields without the code, which
 * never changes; a success calls `onDone`. After a failure the action echoes the entered values, which
 * become the controls' default values (each control's `key` follows its value).
 */
export function DivisionForm(props: DivisionFormProps) {
  const t = useTranslations('admin.divisions.form');
  const editing = props.mode === 'edit' ? props.division : null;
  const onDone = props.mode === 'edit' ? props.onDone : null;
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const next = editing
        ? await updateDivisionAction(previous, formData)
        : await createDivisionAction(previous, formData);
      if (next.ok) onDone?.();
      return next;
    },
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;

  const code = shown(result, 'divisionCode', '');
  const nameAr = shown(result, 'nameAr', editing?.nameAr ?? '');
  const nameEn = shown(result, 'nameEn', editing?.nameEn ?? '');
  const sortOrder = shown(result, 'sortOrder', String(editing?.sortOrder ?? 0));
  const id = (field: string) => (editing ? `division-${field}-${editing.id}` : `division-${field}`);

  const submit = <SubmitButton>{editing ? t('save') : t('submit')}</SubmitButton>;

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-6"
      data-slot={editing ? 'division-edit-form' : 'division-create-form'}
    >
      {editing ? <input type="hidden" name="divisionId" value={editing.id} /> : null}
      <FormError result={result} pending={pending} />
      {!editing && !pending && result?.ok === true ? (
        <Alert variant="success" role="status" data-slot="division-added">
          {t('added')}
        </Alert>
      ) : null}

      <div className={editing ? 'grid gap-6' : 'grid gap-6 sm:grid-cols-2'}>
        {editing ? null : (
          <Field
            id={id('code')}
            label={t('code')}
            hint={t('codeHint')}
            error={fieldErrors?.divisionCode}
            errorMessage={fieldErrors?.divisionCode === 'code_taken' ? t('codeTaken') : undefined}
          >
            {(control) => (
              <Input
                key={`code-${code}`}
                {...control}
                name="divisionCode"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                maxLength={16}
                defaultValue={code}
                className="sm:max-w-48"
              />
            )}
          </Field>
        )}
        <Field
          id={id('order')}
          label={t('sortOrder')}
          hint={t('sortOrderHint')}
          error={fieldErrors?.sortOrder}
        >
          {(control) => (
            <Input
              key={`order-${sortOrder}`}
              {...control}
              name="sortOrder"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              defaultValue={sortOrder}
              className="sm:max-w-32"
            />
          )}
        </Field>
        <Field id={id('name-ar')} label={t('nameAr')} error={fieldErrors?.nameAr}>
          {(control) => (
            <Input
              key={`nameAr-${nameAr}`}
              {...control}
              name="nameAr"
              dir="rtl"
              lang="ar"
              autoComplete="off"
              required
              maxLength={80}
              defaultValue={nameAr}
            />
          )}
        </Field>
        <Field id={id('name-en')} label={t('nameEn')} error={fieldErrors?.nameEn}>
          {(control) => (
            <Input
              key={`nameEn-${nameEn}`}
              {...control}
              name="nameEn"
              dir="ltr"
              lang="en"
              autoComplete="off"
              required
              maxLength={80}
              defaultValue={nameEn}
            />
          )}
        </Field>
      </div>

      {props.mode === 'edit' ? (
        props.footer(submit)
      ) : (
        <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
      )}
    </form>
  );
}
