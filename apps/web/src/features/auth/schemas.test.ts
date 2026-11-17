import { describe, expect, it } from 'vitest';
import { parseForm } from '@/lib/form';
import {
  forgotPasswordSchema,
  registerSchema,
  resendSchema,
  resetPasswordSchema,
  signInSchema,
} from './schemas';

const PASSWORD = 'Ab1'.repeat(4);

const VALID = {
  tenantSlug: 'demo',
  name: 'Mona Ali',
  email: 'mona@example.edu',
  password: PASSWORD,
  consent: 'on',
};

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

/** The field error of `field` when `value` replaces the valid one (undefined = field missing). */
function errorFor(field: keyof typeof VALID, value: string | undefined) {
  const result = parseForm(registerSchema, form({ ...VALID, [field]: value }));
  if (result.ok) return null;
  return result.failure.ok ? null : (result.failure.fieldErrors?.[field] ?? null);
}

describe('registerSchema', () => {
  it('accepts a valid registration, trimming and lower-casing, and drops unknown fields', () => {
    const result = parseForm(
      registerSchema,
      form({
        ...VALID,
        tenantSlug: ' demo-college ',
        name: '  Mona Ali  ',
        email: '  Mona@Example.EDU ',
        role: 'admin',
        status: 'suspended',
      }),
    );
    expect(result).toStrictEqual({
      ok: true,
      data: {
        tenantSlug: 'demo-college',
        name: 'Mona Ali',
        email: 'mona@example.edu',
        password: PASSWORD,
        consent: 'on',
      },
    });
  });

  it('reports every invalid field at once', () => {
    const result = parseForm(registerSchema, form({}));
    expect(result.ok ? null : result.failure).toStrictEqual({
      ok: false,
      code: 'validation',
      fieldErrors: {
        tenantSlug: 'required',
        name: 'required',
        email: 'required',
        password: 'required',
        consent: 'consent_required',
      },
    });
  });

  it.each([
    [undefined, 'required'],
    ['   ', 'required'],
    ['ab', 'invalid_choice'],
    ['x'.repeat(41), 'invalid_choice'],
    ['Demo', 'invalid_choice'],
    ['demo--college', 'invalid_choice'],
    ['-demo', 'invalid_choice'],
  ])('tenantSlug %j → %s', (value, code) => {
    expect(errorFor('tenantSlug', value)).toBe(code);
  });

  it.each([
    [undefined, 'required'],
    ['   ', 'required'],
    [' M ', 'too_short'],
    ['م'.repeat(101), 'too_long'],
    ['Mona\u0000Ali', 'invalid_format'],
    ['Mona\nAli', 'invalid_format'],
    ['Mona\tAli', 'invalid_format'],
    ['Mona\u007fAli', 'invalid_format'],
    ['Mona\u202aAli', 'invalid_format'],
    ['Mona\u202bAli', 'invalid_format'],
    ['Mona\u202cAli', 'invalid_format'],
    ['Mona\u202dAli', 'invalid_format'],
    ['Mona\u202eAli', 'invalid_format'],
    ['Mona\u2066Ali', 'invalid_format'],
    ['Mona\u2067Ali', 'invalid_format'],
    ['Mona\u2068Ali', 'invalid_format'],
    ['Mona\u2069Ali', 'invalid_format'],
  ])('name %j → %s', (value, code) => {
    expect(errorFor('name', value)).toBe(code);
  });

  it('accepts the zero-width joiners used in Arabic and Persian names and the code points next to the bidi ranges', () => {
    expect(errorFor('name', 'می\u200Cخواهم')).toBeNull();
    expect(errorFor('name', 'محمد\u200Dعلي')).toBeNull();
    expect(errorFor('name', 'Mona\u2070Ali')).toBeNull();
    expect(errorFor('name', '\u0645\u0646\u0649\u200e Ali\u200f')).toBeNull();
    expect(errorFor('name', '\u0645\u0646\u0649\u061c Ali')).toBeNull();
    expect(errorFor('name', 'Mona\u2065Ali')).toBeNull();
  });

  it('accepts names of exactly 2 and 100 characters', () => {
    expect(errorFor('name', 'Mo')).toBeNull();
    expect(errorFor('name', 'م'.repeat(100))).toBeNull();
  });

  it.each([
    [undefined, 'required'],
    ['  ', 'required'],
    ['not-an-email', 'invalid_email'],
    ['a@b', 'invalid_email'],
    ['a@example.edu, b@example.edu', 'invalid_email'],
    [`${'a'.repeat(250)}@example.edu`, 'too_long'],
  ])('email %j → %s', (value, code) => {
    expect(errorFor('email', value)).toBe(code);
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['short', 'password_too_short'],
    ['x'.repeat(9), 'password_too_short'],
    ['x'.repeat(129), 'password_too_long'],
  ])('password %j → %s', (value, code) => {
    expect(errorFor('password', value)).toBe(code);
  });

  it('does not trim the password and accepts 10 and 128 characters', () => {
    const spaced = `  ${'x'.repeat(8)}`;
    const result = parseForm(registerSchema, form({ ...VALID, password: spaced }));
    expect(result.ok && result.data.password).toBe(spaced);
    expect(errorFor('password', 'x'.repeat(128))).toBeNull();
  });

  it.each([
    [undefined, 'consent_required'],
    ['off', 'consent_required'],
    ['true', 'consent_required'],
  ])('consent %j → %s', (value, code) => {
    expect(errorFor('consent', value)).toBe(code);
  });
});

describe('resendSchema', () => {
  it('trims and lower-cases the email and drops unknown fields', () => {
    expect(parseForm(resendSchema, form({ email: ' Mona@Example.EDU ', name: 'x' }))).toStrictEqual(
      { ok: true, data: { email: 'mona@example.edu' } },
    );
  });

  it.each([
    [undefined, 'required'],
    ['  ', 'required'],
    ['not-an-email', 'invalid_email'],
    [`${'a'.repeat(250)}@example.edu`, 'too_long'],
  ])('email %j → %s', (value, code) => {
    const result = parseForm(resendSchema, form({ email: value }));
    expect(result.ok ? null : result.failure).toMatchObject({
      code: 'validation',
      fieldErrors: { email: code },
    });
  });
});

describe('signInSchema', () => {
  it('trims and lower-cases the email, keeps the password as typed, and drops unknown fields', () => {
    const result = parseForm(
      signInSchema,
      form({
        email: ' Mona@Example.EDU ',
        password: `  ${PASSWORD}`,
        role: 'admin',
        next: '/profile',
      }),
    );
    expect(result).toStrictEqual({
      ok: true,
      data: { email: 'mona@example.edu', password: `  ${PASSWORD}`, next: '/profile' },
    });
  });

  it('reports a missing email and password as required', () => {
    const result = parseForm(signInSchema, form({ password: '' }));
    expect(result.ok ? null : result.failure).toStrictEqual({
      ok: false,
      code: 'validation',
      fieldErrors: { email: 'required', password: 'required' },
    });
  });

  it('accepts a one-character password (only the stored password decides)', () => {
    expect(parseForm(signInSchema, form({ email: 'a@example.edu', password: 'x' })).ok).toBe(true);
  });

  it.each([
    [undefined],
    [''],
    ['//evil.test'],
    ['/\\evil.test'],
    ['https://evil.test/dashboard'],
    ['dashboard'],
    [`/${'x'.repeat(512)}`],
  ])('ignores next %j without failing', (next) => {
    const result = parseForm(signInSchema, form({ email: 'a@example.edu', password: 'x', next }));
    expect(result).toMatchObject({ ok: true, data: { next: null } });
  });

  it('keeps a safe next with its query', () => {
    const result = parseForm(
      signInSchema,
      form({ email: 'a@example.edu', password: 'x', next: '/admin/users?page=2' }),
    );
    expect(result).toMatchObject({ ok: true, data: { next: '/admin/users?page=2' } });
  });

  it('drops a leading locale from next (the action adds the user’s own)', () => {
    const result = parseForm(
      signInSchema,
      form({ email: 'a@example.edu', password: 'x', next: '/en/profile' }),
    );
    expect(result).toMatchObject({ ok: true, data: { next: '/profile' } });
  });
});

describe('forgotPasswordSchema', () => {
  it('trims and lower-cases the email and drops unknown fields', () => {
    expect(
      parseForm(forgotPasswordSchema, form({ email: ' Mona@Example.EDU ', token: 'x' })),
    ).toStrictEqual({ ok: true, data: { email: 'mona@example.edu' } });
  });

  it.each([
    [undefined, 'required'],
    ['  ', 'required'],
    ['not-an-email', 'invalid_email'],
    [`${'a'.repeat(250)}@example.edu`, 'too_long'],
  ])('email %j → %s', (value, code) => {
    const result = parseForm(forgotPasswordSchema, form({ email: value }));
    expect(result.ok ? null : result.failure).toMatchObject({
      code: 'validation',
      fieldErrors: { email: code },
    });
  });
});

describe('resetPasswordSchema', () => {
  const TOKEN = 'Tk9'.repeat(8);

  function resetErrors(entries: Record<string, string | undefined>) {
    const result = parseForm(resetPasswordSchema, form(entries));
    if (result.ok) return null;
    return result.failure.ok ? null : (result.failure.fieldErrors ?? null);
  }

  it('keeps the password as typed, trims the token, and drops unknown fields', () => {
    expect(
      parseForm(
        resetPasswordSchema,
        form({ token: ` ${TOKEN} `, password: ` ${PASSWORD} `, email: 'a@example.edu' }),
      ),
    ).toStrictEqual({ ok: true, data: { token: TOKEN, password: ` ${PASSWORD} ` } });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['x'.repeat(9), 'password_too_short'],
    ['x'.repeat(129), 'password_too_long'],
  ])('password %j → %s', (password, code) => {
    expect(resetErrors({ token: TOKEN, password })).toStrictEqual({ password: code });
  });

  it('accepts passwords of exactly 10 and 128 characters', () => {
    expect(resetErrors({ token: TOKEN, password: 'x'.repeat(10) })).toBeNull();
    expect(resetErrors({ token: TOKEN, password: 'x'.repeat(128) })).toBeNull();
  });

  it.each([
    [undefined, 'required'],
    ['  ', 'required'],
    ['abc/def', 'invalid_format'],
    ['abc%2Fdef', 'invalid_format'],
    ['x'.repeat(257), 'invalid_format'],
  ])('token %j → %s', (token, code) => {
    expect(resetErrors({ token, password: PASSWORD })).toStrictEqual({ token: code });
  });
});
