'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field } from '@/components/forms/field';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import { registerStudentAction } from '../actions';

export type CollegeOption = Readonly<{ slug: string; name: string }>;

type RegisterFormProps = Readonly<{
  /** The college fixed by `?u=` or because it is the only active one; null shows the picker. */
  college: CollegeOption | null;
  /** Active colleges for the picker. */
  colleges: readonly CollegeOption[];
}>;

/** A value the action echoed back after a failure (`meta.<field>`; never the password). */
function entered(result: ActionResult | null, key: string): string {
  const value = result?.ok === false ? result.meta?.[key] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Student registration form (FR-001, FR-002, FR-011). Works without JavaScript (the Server Action posts
 * the form natively and the page is rendered from its result). After a failure the action echoes the
 * non-secret fields, which become the inputs' default values: React resets the form to them, and without
 * JavaScript they are rendered into the page. The password is never echoed.
 */
export function RegisterForm({ college, colleges }: RegisterFormProps) {
  const t = useTranslations('auth.register');
  const tCommon = useTranslations('common');
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    registerStudentAction,
    null,
  );
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const domains = entered(result, 'domains');
  const consent = entered(result, 'consent') === 'on';
  const collegeRefused = fieldErrors?.tenantSlug !== undefined;
  // A fixed college that the action refused (e.g. suspended meanwhile): let the visitor choose again.
  const fixed = collegeRefused ? null : college;
  // A refused college is never preselected again, so the picker starts from its placeholder.
  const pickerValue = collegeRefused ? '' : entered(result, 'tenantSlug');

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormError result={result} pending={pending} />

      {fixed === null ? (
        <Field id="register-college" label={t('college')} error={fieldErrors?.tenantSlug}>
          {(control) => (
            <Select
              key={`college-${pickerValue}`}
              {...control}
              name="tenantSlug"
              required
              defaultValue={pickerValue}
            >
              <option value="">{t('collegePlaceholder')}</option>
              {colleges.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <Field id="register-college" label={t('college')}>
          {(control) => (
            <>
              <Input {...control} readOnly value={fixed.name} />
              <input type="hidden" name="tenantSlug" value={fixed.slug} />
            </>
          )}
        </Field>
      )}

      <Field id="register-name" label={t('name')} error={fieldErrors?.name}>
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
        id="register-email"
        label={t('email')}
        error={fieldErrors?.email}
        hint={
          fieldErrors?.email === 'domain_not_allowed' && domains !== '' ? (
            <>
              {t('allowedDomains')}
              <bdi dir="ltr" className="ms-1">
                {domains}
              </bdi>
            </>
          ) : null
        }
      >
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            dir="ltr"
            autoComplete="email"
            required
            defaultValue={entered(result, 'email')}
          />
        )}
      </Field>

      <Field
        id="register-password"
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
        id="register-consent"
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
            key={`consent-${String(consent)}`}
            {...control}
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
