'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import type { ActionResult } from '@/lib/result';
import { updateTenantSettingsAction } from '../actions';

/** One option of a picker, already in the current language. */
export type ChoiceOption = Readonly<{ value: string; label: string }>;

/** One module checkbox: its key, name, and one-sentence description in the current language. */
export type ModuleOption = Readonly<{ value: string; label: string; description: string }>;

/** The college's saved settings, as the session context holds them. */
export type CurrentSettings = Readonly<{
  nameAr: string;
  nameEn: string;
  allowedEmailDomains: readonly string[];
  levelsCount: number;
  enabledModules: readonly string[];
}>;

type SettingsFormProps = Readonly<{
  current: CurrentSettings;
  /** 1–7, written with Western digits. */
  levels: readonly ChoiceOption[];
  /** The six modules, in registry order. */
  modules: readonly ModuleOption[];
}>;

/** A value the action echoed back after a failure (`meta.<key>`), else `fallback` (the saved value). */
function shown(result: ActionResult | null, key: string, fallback: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : fallback;
}

const ltr = (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>;

/**
 * The college settings form (FR-032, FR-034): Arabic name (`dir="rtl"`), English name (`dir="ltr"`), allowed
 * email domains one per line (`dir="ltr"`), number of levels, and the six module switches in a fieldset.
 * Starts from the saved settings; works without JavaScript; after a failure the action echoes the entered
 * values, which become the controls' default values (each control's `key` follows its value, so the
 * refreshed settings show after a save too).
 */
export function SettingsForm({ current, levels, modules }: SettingsFormProps) {
  const t = useTranslations('admin.settings');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateTenantSettingsAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;

  const nameAr = shown(result, 'nameAr', current.nameAr);
  const nameEn = shown(result, 'nameEn', current.nameEn);
  const domains = shown(result, 'allowedEmailDomains', current.allowedEmailDomains.join('\n'));
  const savedLevels = String(current.levelsCount);
  const enteredLevels = shown(result, 'levelsCount', savedLevels).trim();
  const levelsCount = levels.some((option) => option.value === enteredLevels)
    ? enteredLevels
    : savedLevels;
  const enabled = new Set(
    shown(result, 'enabledModules', current.enabledModules.join(','))
      .split(',')
      .filter((key) => key !== ''),
  );
  const min = result?.ok === false ? result.meta?.min : undefined;

  const domainsError =
    fieldErrors?.allowedEmailDomains === 'invalid_format'
      ? t.rich('students.domainsInvalid', { ltr })
      : fieldErrors?.allowedEmailDomains === 'too_many'
        ? t('students.domainsTooMany')
        : undefined;

  const legend = 'mb-4 text-lg font-semibold';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-8">
      <FormError result={result} pending={pending} />
      {!pending && result?.ok === true ? (
        <Alert variant="success" role="status" data-slot="settings-saved">
          {t('saved')}
        </Alert>
      ) : null}

      <fieldset aria-describedby="settings-names-hint">
        <legend className={legend}>{t('names.legend')}</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="settings-name-ar" label={t('names.nameAr')} error={fieldErrors?.nameAr}>
            {(control) => (
              <Input
                key={`nameAr-${nameAr}`}
                {...control}
                name="nameAr"
                dir="rtl"
                lang="ar"
                autoComplete="off"
                required
                maxLength={120}
                defaultValue={nameAr}
              />
            )}
          </Field>
          <Field id="settings-name-en" label={t('names.nameEn')} error={fieldErrors?.nameEn}>
            {(control) => (
              <Input
                key={`nameEn-${nameEn}`}
                {...control}
                name="nameEn"
                dir="ltr"
                lang="en"
                autoComplete="off"
                required
                maxLength={120}
                defaultValue={nameEn}
              />
            )}
          </Field>
        </div>
        <p id="settings-names-hint" className="mt-2 text-sm text-muted-foreground">
          {t('names.hint')}
        </p>
      </fieldset>

      {/* A rule line between groups (a fieldset's own border would cut through its legend). */}
      <hr className="border-border" />
      <fieldset>
        <legend className={legend}>{t('students.legend')}</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="settings-domains"
            label={t('students.domains')}
            hint={t.rich('students.domainsHint', { ltr })}
            error={fieldErrors?.allowedEmailDomains}
            errorMessage={domainsError}
          >
            {(control) => (
              <Textarea
                key={`domains-${domains}`}
                {...control}
                name="allowedEmailDomains"
                dir="ltr"
                rows={4}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={domains}
              />
            )}
          </Field>
          <Field
            id="settings-levels"
            label={t('students.levelsCount')}
            hint={t('students.levelsCountHint')}
            error={fieldErrors?.levelsCount}
            errorMessage={
              fieldErrors?.levelsCount === 'levels_in_use' && typeof min === 'number'
                ? t('students.levelsInUse', { min: formatNumber(min, locale) })
                : undefined
            }
          >
            {(control) => (
              <Select
                key={`levels-${levelsCount}`}
                {...control}
                name="levelsCount"
                required
                defaultValue={levelsCount}
                className="sm:max-w-40"
              >
                {levels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      <hr className="border-border" />
      <fieldset aria-describedby="settings-modules-hint" data-slot="settings-modules">
        <legend className={legend}>{t('modules.legend')}</legend>
        <p id="settings-modules-hint" className="text-sm text-muted-foreground">
          {t('modules.hint')}
        </p>
        {fieldErrors?.enabledModules ? (
          <p className="mt-2 text-sm font-medium text-danger">
            {tErrors(fieldErrors.enabledModules)}
          </p>
        ) : null}
        <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {modules.map((option) => (
            <li key={option.value}>
              <Field
                id={`settings-module-${option.value}`}
                layout="inline"
                label={option.label}
                hint={option.description}
              >
                {(control) => (
                  <Checkbox
                    key={`${option.value}-${String(enabled.has(option.value))}`}
                    {...control}
                    name="enabledModules"
                    value={option.value}
                    defaultChecked={enabled.has(option.value)}
                  />
                )}
              </Field>
            </li>
          ))}
        </ul>
      </fieldset>

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
