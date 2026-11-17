import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok, type ActionResult } from '@/lib/result';
import en from '../../../../messages/en.json';
import { RegisterForm } from './register-form';
import { ResendVerificationForm } from './resend-verification-form';
import { SignInForm } from './sign-in-form';

// The account forms rendered from a given action state. `useActionState` is mocked to return that state
// (the rest of React is real); the Server Actions and the locale-aware Link are replaced by stubs.
const actionState = vi.hoisted((): { current: unknown; pending: boolean } => ({
  current: null,
  pending: false,
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: () => [actionState.current, () => undefined, actionState.pending],
  };
});
vi.mock('../actions', () => ({
  registerStudentAction: () => undefined,
  resendVerificationAction: () => undefined,
  signInAction: () => undefined,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  actionState.current = null;
  actionState.pending = false;
});

function render(node: ReactNode, state: ActionResult | null): string {
  actionState.current = state;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Africa/Cairo">
      {node}
    </NextIntlClientProvider>,
  );
}

const COLLEGES = [
  { slug: 'demo', name: 'Demo College' },
  { slug: 'other', name: 'Other College' },
];

/** The opening tag of the `<option>` with this value. */
function option(html: string, value: string): string {
  return new RegExp(`<option[^>]*value="${value}"[^>]*>`).exec(html)?.[0] ?? '';
}

describe('RegisterForm', () => {
  it('keeps a chosen college that was not refused', () => {
    const html = render(
      <RegisterForm college={null} colleges={COLLEGES} />,
      fail('validation', { fieldErrors: { name: 'too_short' }, meta: { tenantSlug: 'demo' } }),
    );
    expect(option(html, 'demo')).toContain('selected');
  });

  it('shows the picker without a preselected college when a fixed college is refused', () => {
    const html = render(
      <RegisterForm college={COLLEGES[0] ?? null} colleges={COLLEGES} />,
      fail('validation', {
        fieldErrors: { tenantSlug: 'invalid_choice' },
        meta: { tenantSlug: 'demo' },
      }),
    );
    expect(html).toContain('<select');
    expect(html).not.toContain('type="hidden"');
    expect(option(html, 'demo')).not.toContain('selected');
    expect(option(html, '')).toContain('selected');
    expect(html).toContain(en.errors.invalid_choice);
  });

  it('does not preselect a refused college chosen in the picker', () => {
    const html = render(
      <RegisterForm college={null} colleges={COLLEGES} />,
      fail('validation', {
        fieldErrors: { tenantSlug: 'invalid_choice' },
        meta: { tenantSlug: 'other' },
      }),
    );
    expect(option(html, 'other')).not.toContain('selected');
    expect(option(html, '')).toContain('selected');
  });
});

/** The live region, always rendered, with nothing in it. */
const EMPTY_STATUS = '<div role="status" data-slot="form-status"></div>';

describe('ResendVerificationForm', () => {
  it('shows no status sentence before a request', () => {
    const html = render(<ResendVerificationForm />, null);
    expect(html).toContain(EMPTY_STATUS);
    expect(html).not.toContain(en.auth.resend.sent);
  });

  it('shows the same sentence after every successful request', () => {
    const html = render(<ResendVerificationForm />, ok(undefined));
    expect(html).toMatch(
      new RegExp(
        `<div role="status" data-slot="form-status"><p[^>]*>${en.auth.resend.sent}</p></div>`,
      ),
    );
    expect(html).not.toContain('data-slot="form-error"');
  });

  it('removes the sentence while a new request is pending, so the next success is announced again', () => {
    actionState.pending = true;
    const html = render(<ResendVerificationForm />, ok(undefined));
    expect(html).toContain(EMPTY_STATUS);
    expect(html).not.toContain(en.auth.resend.sent);
  });

  it('shows the field error and keeps the entered email', () => {
    const html = render(
      <ResendVerificationForm id="resend" />,
      fail('validation', { fieldErrors: { email: 'invalid_email' }, meta: { email: 'x@' } }),
    );
    expect(html).toContain('aria-describedby="resend-error"');
    expect(html).toContain(en.errors.invalid_email);
    expect(html).toContain('value="x@"');
    expect(html).not.toContain(en.auth.resend.sent);
  });

  it('shows when to try again after a rate-limit refusal', () => {
    const html = render(
      <ResendVerificationForm />,
      fail('rate_limited', { retryAfterSeconds: 3600 }),
    );
    expect(html).toContain(en.errors.rate_limited);
    expect(html).toContain('You can try again in 60 minutes.');
  });

  it('starts with the given email', () => {
    const html = render(<ResendVerificationForm id="r" defaultEmail="mona@example.edu" />, null);
    expect(html).toMatch(/<input[^>]*id="r"[^>]*value="mona@example.edu"/);
  });

  it('removes a previous error while a new request is pending, so it is announced again', () => {
    actionState.pending = true;
    const html = render(
      <ResendVerificationForm />,
      fail('rate_limited', { retryAfterSeconds: 3600 }),
    );
    expect(html).not.toContain('data-slot="form-error"');
  });
});

describe('SignInForm', () => {
  it('sends a safe next back as a hidden field, and none without one', () => {
    expect(render(<SignInForm next="/profile" />, null)).toContain(
      '<input type="hidden" name="next" value="/profile"/>',
    );
    expect(render(<SignInForm next={null} />, null)).not.toContain('name="next"');
  });

  it('labels the fields for sign-in, with dir="ltr" inputs and the right autocomplete', () => {
    const html = render(<SignInForm next={null} />, null);
    expect(html).toMatch(/<input[^>]*id="sign-in-email"[^>]*dir="ltr"[^>]*autoComplete="email"/);
    expect(html).toMatch(
      /<input[^>]*id="sign-in-password"[^>]*dir="ltr"[^>]*autoComplete="current-password"/,
    );
    expect(html).toContain('href="/forgot-password"');
    expect(html).not.toContain('data-slot="form-error"');
  });

  it('shows the generic message and keeps the email, never the password', () => {
    const html = render(
      <SignInForm next={null} />,
      fail('invalid_credentials', { meta: { email: 'mona@example.edu' } }),
    );
    expect(html).toContain('data-code="invalid_credentials"');
    expect(html).toContain(en.errors.invalid_credentials);
    expect(html).toMatch(/<input[^>]*id="sign-in-email"[^>]*value="mona@example.edu"/);
    expect(html).not.toMatch(/<input[^>]*type="password"[^>]*value=/);
    expect(html).not.toContain('sign-in-resend');
  });

  it('offers the resend form, prefilled, for an unconfirmed address', () => {
    const html = render(
      <SignInForm next={null} />,
      fail('email_not_verified', { meta: { email: 'mona@example.edu' } }),
    );
    expect(html).toContain('data-code="email_not_verified"');
    expect(html).toContain('<h2 id="sign-in-resend-title"');
    expect(html).toMatch(/<input[^>]*id="sign-in-resend"[^>]*value="mona@example.edu"/);
  });

  it('removes the previous error while the next attempt is pending', () => {
    actionState.pending = true;
    const html = render(<SignInForm next={null} />, fail('invalid_credentials'));
    expect(html).not.toContain('data-slot="form-error"');
  });
});
