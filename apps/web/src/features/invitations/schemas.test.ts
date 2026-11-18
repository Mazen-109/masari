import { ROLES } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { parseForm } from '@/lib/form';
import { createInvitationSchema } from './schemas';

const VALID = { email: 'dean@college.example', role: 'faculty' };

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

/** The field error of `field` when `value` replaces the valid one (undefined = field missing). */
function errorFor(field: keyof typeof VALID, value: string | undefined) {
  const result = parseForm(createInvitationSchema, form({ ...VALID, [field]: value }));
  if (result.ok) return null;
  return result.failure.ok ? null : (result.failure.fieldErrors?.[field] ?? null);
}

describe('createInvitationSchema', () => {
  it('accepts an email and a role, trimming and lower-casing the email and dropping unknown fields', () => {
    const result = parseForm(
      createInvitationSchema,
      form({ email: '  Dean@College.Example ', role: 'faculty', tenantId: 'other', status: 'x' }),
    );
    expect(result).toEqual({
      ok: true,
      data: { email: 'dean@college.example', role: 'faculty' },
    });
  });

  it.each(ROLES)('accepts the role %s', (role) => {
    expect(errorFor('role', role)).toBeNull();
  });

  it('trims the role', () => {
    const result = parseForm(createInvitationSchema, form({ ...VALID, role: ' admin ' }));
    expect(result).toEqual({ ok: true, data: { email: VALID.email, role: 'admin' } });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['   ', 'required'],
    ['not-an-email', 'invalid_email'],
    ['a@b', 'invalid_email'],
    [`${'a'.repeat(250)}@x.test`, 'too_long'],
  ] as const)('refuses the email %j with %s', (value, code) => {
    expect(errorFor('email', value)).toBe(code);
  });

  it.each([[undefined], [''], ['owner'], ['Admin'], ['operator']])(
    'refuses the role %j with invalid_choice',
    (value) => {
      expect(errorFor('role', value)).toBe('invalid_choice');
    },
  );

  it('reports both fields at once', () => {
    const result = parseForm(createInvitationSchema, form({}));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.failure.ok) {
      expect(result.failure.fieldErrors).toEqual({ email: 'required', role: 'invalid_choice' });
    }
  });
});
