import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import { Field, type FieldControlProps } from './field';
import { FormError } from './form-error';
import { SubmitButton } from './submit-button';

// `useFormStatus` is mocked so the pending state can be rendered without submitting a form; the rest of
// react-dom is the real module.
const formStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    useFormStatus: () => ({ ...actual.useFormStatus(), pending: formStatus.pending }),
  };
});

afterEach(() => {
  formStatus.pending = false;
});

function render(node: ReactNode, locale: 'ar' | 'en' = 'en'): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'ar' ? ar : en}
      timeZone="Africa/Cairo"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const input = (props: FieldControlProps) => <input name="field" {...props} />;

/** The opening tag of the first element with the given tag name. */
function openingTag(html: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>`).exec(html)?.[0] ?? '';
}

describe('Field', () => {
  it('ties a visible label to the control, with no error wiring when valid', () => {
    const html = render(
      <Field id="email" label="Email">
        {input}
      </Field>,
    );
    expect(openingTag(html, 'label')).toContain('for="email"');
    const control = openingTag(html, 'input');
    expect(control).toContain('id="email"');
    expect(control).not.toContain('aria-invalid');
    expect(control).not.toContain('aria-describedby');
  });

  it('marks the control invalid and describes it by the translated error', () => {
    const html = render(
      <Field id="email" label="Email" error="invalid_email">
        {input}
      </Field>,
    );
    const control = openingTag(html, 'input');
    expect(control).toContain('aria-invalid="true"');
    expect(control).toContain('aria-describedby="email-error"');
    expect(html).toMatch(new RegExp(`<p id="email-error"[^>]*>${en.errors.invalid_email}</p>`));
  });

  it('lists the error first, then the hint, in aria-describedby', () => {
    const html = render(
      <Field id="password" label="Password" hint="At least 8 characters" error="password_too_short">
        {input}
      </Field>,
    );
    expect(openingTag(html, 'input')).toContain('aria-describedby="password-error password-hint"');
    expect(html).toMatch(/<p id="password-hint"[^>]*>At least 8 characters<\/p>/);
  });

  it('describes a valid control by its hint only', () => {
    const html = render(
      <Field id="name" label="Name" hint="As on your ID">
        {input}
      </Field>,
    );
    const control = openingTag(html, 'input');
    expect(control).toContain('aria-describedby="name-hint"');
    expect(control).not.toContain('aria-invalid');
  });

  it('translates the error in Arabic', () => {
    const html = render(
      <Field id="consent" label="x" error="consent_required">
        {input}
      </Field>,
      'ar',
    );
    expect(html).toContain(ar.errors.consent_required);
  });

  it('generates an id when none is given and wires the label and error to it', () => {
    const html = render(
      <Field label="Name" error="required">
        {input}
      </Field>,
    );
    const id = /<input[^>]* id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(openingTag(html, 'label')).toContain(`for="${id}"`);
    expect(html).toContain(`id="${id}-error"`);
  });

  it('puts the label after the control in the inline layout (checkbox)', () => {
    const html = render(
      <Field id="consent" label="I agree" layout="inline">
        {input}
      </Field>,
    );
    expect(html.indexOf('<input')).toBeLessThan(html.indexOf('<label'));
  });
});

describe('FormError', () => {
  it('renders nothing without a failure', () => {
    expect(render(<FormError result={null} />)).toBe('');
    expect(render(<FormError result={ok(undefined)} />)).toBe('');
  });

  it('renders nothing while the next request is pending, so a repeated error is inserted again', () => {
    const limited = fail('rate_limited', { retryAfterSeconds: 60 });
    expect(render(<FormError result={limited} pending />)).toBe('');
    expect(render(<FormError result={limited} pending={false} />)).toContain('role="alert"');
  });

  it('shows the translated error code in a role="alert" summary', () => {
    const html = render(<FormError result={fail('invalid_credentials')} />, 'ar');
    expect(html).toContain('role="alert"');
    expect(html).toContain(ar.errors.invalid_credentials);
    expect(html).not.toContain(ar.errors.rate_limited);
  });

  it('shows when to retry for rate_limited, in whole minutes rounded up', () => {
    const html = render(<FormError result={fail('rate_limited', { retryAfterSeconds: 290 })} />);
    expect(html).toContain(en.errors.rate_limited);
    expect(html).toContain('You can try again in 5 minutes.');
  });

  it('uses the singular for one minute in English', () => {
    const html = render(<FormError result={fail('rate_limited', { retryAfterSeconds: 45 })} />);
    expect(html).toContain('You can try again in 1 minute.');
  });

  it.each([
    [30, 'بعد دقيقة واحدة'],
    [120, 'بعد دقيقتين'],
    [300, 'بعد 5 دقائق'],
    [900, 'بعد 15 دقيقة'],
  ])('uses the Arabic plural form and Western digits for %i seconds', (seconds, text) => {
    const html = render(
      <FormError result={fail('rate_limited', { retryAfterSeconds: seconds })} />,
      'ar',
    );
    expect(html).toContain(text);
  });

  it('shows no retry time when rate_limited has none', () => {
    const html = render(<FormError result={fail('rate_limited')} />);
    expect(html).toContain(en.errors.rate_limited);
    expect(html).not.toContain('try again in');
  });
});

describe('SubmitButton', () => {
  it('is a submit button showing its label while the form is idle', () => {
    const html = render(<SubmitButton>Create account</SubmitButton>);
    expect(html).toMatch(/^<button[^>]* type="submit"/);
    expect(html).toContain('Create account');
    expect(html).not.toContain('aria-disabled=');
    expect(html).not.toContain(en.common.actions.pending);
    expect(html).not.toContain('aria-busy=');
  });

  it.each([
    ['en', en],
    ['ar', ar],
  ] as const)(
    'says "please wait" and is marked busy while the form is sent (%s)',
    (locale, catalog) => {
      formStatus.pending = true;
      const html = render(<SubmitButton>Create account</SubmitButton>, locale);
      const button = /^<button\b[^>]*>/.exec(html)?.[0] ?? '';
      expect(button).toContain('type="submit"');
      expect(button).toContain('aria-disabled="true"');
      expect(button).toContain('aria-busy="true"');
      // Looks disabled while pending (the aria-disabled styles of Button).
      expect(button).toContain('aria-disabled:opacity-70');
      expect(button).toContain('aria-disabled:cursor-not-allowed');
      // Stays focusable: marked aria-disabled, never the disabled attribute.
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(html).toContain(catalog.common.actions.pending);
      expect(html).not.toContain('Create account');
    },
  );
});
