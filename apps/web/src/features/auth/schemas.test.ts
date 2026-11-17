import { describe, expect, it } from 'vitest';
import { parseForm } from '@/lib/form';
import { registerSchema } from './schemas';

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
  ])('name %j → %s', (value, code) => {
    expect(errorFor('name', value)).toBe(code);
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
