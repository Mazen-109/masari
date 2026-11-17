'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type FormEvent } from 'react';
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

/** What the user typed, kept on the client only so the fields keep their values after a failed attempt. */
type Remembered = { tenantSlug: string; name: string; email: string; consent: boolean };

const EMPTY: Remembered = { tenantSlug: '', name: '', email: '', consent: false };

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Student registration form (FR-001, FR-002, FR-011). Works without JavaScript (the Server Action posts
 * the form natively). With JavaScript, React resets the form after the action: the inputs then return to
 * their `defaultValue`, which holds what was submitted (the password is never kept).
 */
export function RegisterForm({ college, colleges }: RegisterFormProps) {
  const t = useTranslations('auth.register');
  const [result, formAction] = useActionState<ActionResult | null, FormData>(
    registerStudentAction,
    null,
  );
  const [remembered, setRemembered] = useState<Remembered>(EMPTY);
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined;
  const domains = result?.ok === false ? result.meta?.domains : undefined;

  function remember(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setRemembered({
      tenantSlug: text(data, 'tenantSlug'),
      name: text(data, 'name'),
      email: text(data, 'email'),
      consent: data.get('consent') === 'on',
    });
  }

  return (
    <form action={formAction} onSubmit={remember} noValidate className="flex flex-col gap-6">
      <FormError result={result} />

      {college === null ? (
        <Field id="register-college" label={t('college')} error={fieldErrors?.tenantSlug}>
          {(control) => (
            <Select
              {...control}
              key={`college-${remembered.tenantSlug}`}
              name="tenantSlug"
              required
              defaultValue={remembered.tenantSlug}
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
        <Field id="register-college" label={t('college')} error={fieldErrors?.tenantSlug}>
          {(control) => (
            <>
              <Input {...control} readOnly value={college.name} />
              <input type="hidden" name="tenantSlug" value={college.slug} />
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
            defaultValue={remembered.name}
          />
        )}
      </Field>

      <Field
        id="register-email"
        label={t('email')}
        error={fieldErrors?.email}
        hint={
          fieldErrors?.email === 'domain_not_allowed' && domains !== undefined ? (
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
            defaultValue={remembered.email}
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
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
        error={fieldErrors?.consent}
      >
        {(control) => (
          <Checkbox
            {...control}
            key={`consent-${String(remembered.consent)}`}
            name="consent"
            required
            defaultChecked={remembered.consent}
          />
        )}
      </Field>

      <SubmitButton className="w-full sm:w-auto sm:self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
