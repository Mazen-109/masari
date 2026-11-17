import { describe, expect, it } from 'vitest';
import { parseForm } from '@/lib/form';
import { studentProfileSchema } from './schemas';

const DIVISION_ID = '11111111-1111-4111-8111-111111111111';

const VALID = { studentCode: 'CS-2024-001', level: '3', divisionId: DIVISION_ID };

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

/** The field error of `field` when `value` replaces the valid one (undefined = field missing). */
function errorFor(field: keyof typeof VALID, value: string | undefined) {
  const result = parseForm(studentProfileSchema, form({ ...VALID, [field]: value }));
  if (result.ok) return null;
  return result.failure.ok ? null : (result.failure.fieldErrors?.[field] ?? null);
}

describe('studentProfileSchema', () => {
  it('accepts a valid profile, trimming, converting the level, and dropping unknown fields', () => {
    const result = parseForm(
      studentProfileSchema,
      form({
        studentCode: '  cs-2024-001 ',
        level: ' 3 ',
        divisionId: ` ${DIVISION_ID.toUpperCase()} `,
        role: 'admin',
        tenantId: DIVISION_ID,
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: { studentCode: 'cs-2024-001', level: 3, divisionId: DIVISION_ID },
    });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['   ', 'required'],
    ['AB', 'invalid_format'],
    ['1'.repeat(21), 'invalid_format'],
    ['CS 2024', 'invalid_format'],
    ['CS_2024', 'invalid_format'],
    ['٢٠٢٤٠٠١', 'invalid_format'],
    ['كود123', 'invalid_format'],
  ])('studentCode %j → %s', (value, code) => {
    expect(errorFor('studentCode', value)).toBe(code);
  });

  it.each([['ABC'], ['1'.repeat(20)], ['a-b-c'], ['20240001']])(
    'studentCode %j is valid',
    (value) => {
      expect(errorFor('studentCode', value)).toBeNull();
    },
  );

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['0', 'out_of_range'],
    ['8', 'out_of_range'],
    ['-1', 'out_of_range'],
    ['2.5', 'out_of_range'],
    ['abc', 'out_of_range'],
    ['٣', 'out_of_range'],
    ['100', 'out_of_range'],
  ])('level %j → %s', (value, code) => {
    expect(errorFor('level', value)).toBe(code);
  });

  it.each([['1'], ['7'], ['07']])('level %j is valid', (value) => {
    expect(errorFor('level', value)).toBeNull();
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    ['not-a-uuid', 'invalid_choice'],
    [`${DIVISION_ID}x`, 'invalid_choice'],
  ])('divisionId %j → %s', (value, code) => {
    expect(errorFor('divisionId', value)).toBe(code);
  });

  it('reports every invalid field at once', () => {
    const result = parseForm(studentProfileSchema, form({}));
    expect(result).toEqual({
      ok: false,
      failure: {
        ok: false,
        code: 'validation',
        fieldErrors: { studentCode: 'required', level: 'required', divisionId: 'required' },
      },
    });
  });
});
