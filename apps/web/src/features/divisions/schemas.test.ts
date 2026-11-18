import { describe, expect, it } from 'vitest';
import { fieldErrorsOf } from '@/lib/form';
import {
  createDivisionSchema,
  DIVISION_CODE,
  MAX_DIVISION_CODE_LENGTH,
  MAX_DIVISION_NAME_LENGTH,
  MAX_SORT_ORDER,
  setDivisionActiveSchema,
  updateDivisionSchema,
} from './schemas';

// contracts/server-actions.md §5.5 field rules (FR-033; data-model.md §3.5): every field error code of the
// three divisions forms.

const valid = {
  divisionCode: ' se ',
  nameAr: ' هندسة البرمجيات ',
  nameEn: ' Software Engineering ',
  sortOrder: ' 3 ',
};

const ID = '22222222-2222-4222-8222-222222222222';

function errors(schema: typeof createDivisionSchema, input: Record<string, unknown>) {
  const parsed = schema.safeParse(input);
  return parsed.success ? {} : fieldErrorsOf(parsed.error);
}

describe('createDivisionSchema', () => {
  it('trims everything, upper-cases the code, and reads the order', () => {
    expect(createDivisionSchema.parse(valid)).toEqual({
      divisionCode: 'SE',
      nameAr: 'هندسة البرمجيات',
      nameEn: 'Software Engineering',
      sortOrder: 3,
    });
  });

  it('accepts digits, hyphens, and underscores in a code of up to 16 characters', () => {
    const code = 'A1_B2-C3'.repeat(2);
    expect(code).toHaveLength(MAX_DIVISION_CODE_LENGTH);
    expect(createDivisionSchema.parse({ ...valid, divisionCode: code }).divisionCode).toBe(code);
  });

  it('upper-cases a lower-case code of 16 characters', () => {
    expect(
      createDivisionSchema.parse({ ...valid, divisionCode: 'a1_b2-c3'.repeat(2) }).divisionCode,
    ).toBe('A1_B2-C3'.repeat(2));
  });

  it('stores only codes matching the contract pattern ^[A-Z0-9_-]{1,16}$', () => {
    expect(DIVISION_CODE.test('A'.repeat(MAX_DIVISION_CODE_LENGTH))).toBe(true);
    expect(DIVISION_CODE.test('S'.repeat(MAX_DIVISION_CODE_LENGTH * 2))).toBe(false);
    expect(DIVISION_CODE.test('')).toBe(false);
    expect(DIVISION_CODE.test('se')).toBe(false);
  });

  it('reads an empty order as 0 and accepts 0 to 9999', () => {
    expect(createDivisionSchema.parse({ ...valid, sortOrder: '' }).sortOrder).toBe(0);
    expect(createDivisionSchema.parse({ ...valid, sortOrder: '0' }).sortOrder).toBe(0);
    expect(
      createDivisionSchema.parse({ ...valid, sortOrder: String(MAX_SORT_ORDER) }).sortOrder,
    ).toBe(MAX_SORT_ORDER);
  });

  it('accepts names of exactly 80 characters', () => {
    const input = {
      ...valid,
      nameAr: 'ش'.repeat(MAX_DIVISION_NAME_LENGTH),
      nameEn: 'S'.repeat(MAX_DIVISION_NAME_LENGTH),
    };
    expect(createDivisionSchema.safeParse(input).success).toBe(true);
  });

  it('drops unknown fields such as tenantId and isActive', () => {
    const parsed = createDivisionSchema.parse({ ...valid, tenantId: ID, isActive: 'false' });
    expect(Object.keys(parsed).sort()).toEqual(['divisionCode', 'nameAr', 'nameEn', 'sortOrder']);
  });

  it.each([
    ['divisionCode', '  ', 'required'],
    ['divisionCode', undefined, 'required'],
    ['divisionCode', 'A'.repeat(MAX_DIVISION_CODE_LENGTH + 1), 'too_long'],
    ['divisionCode', 'S E', 'invalid_format'],
    ['divisionCode', 'SE.1', 'invalid_format'],
    ['divisionCode', 'عام', 'invalid_format'],
    ['divisionCode', 'café', 'invalid_format'],
    // `toUpperCase()` turns these into A–Z: `ß` → `SS` (16 → 32 characters), dotless `ı` → `I`,
    // long `ſ` → `S`. They are not Latin letters and must not reach the database CHECK.
    ['divisionCode', 'ß'.repeat(MAX_DIVISION_CODE_LENGTH), 'invalid_format'],
    ['divisionCode', 'ß', 'invalid_format'],
    ['divisionCode', 'ı', 'invalid_format'],
    ['divisionCode', 'cı', 'invalid_format'],
    ['divisionCode', 'ſe', 'invalid_format'],
    ['nameAr', '', 'required'],
    ['nameEn', undefined, 'required'],
    ['nameAr', 'ش'.repeat(MAX_DIVISION_NAME_LENGTH + 1), 'too_long'],
    ['nameEn', 'Software\nEngineering', 'invalid_format'],
    ['nameAr', 'هندسة ‮البرمجيات', 'invalid_format'],
    ['sortOrder', '-1', 'invalid_format'],
    ['sortOrder', '1.5', 'invalid_format'],
    ['sortOrder', 'first', 'invalid_format'],
    ['sortOrder', '٣', 'invalid_format'],
    ['sortOrder', undefined, 'invalid_format'],
    ['sortOrder', String(MAX_SORT_ORDER + 1), 'out_of_range'],
  ])('refuses %s = %j with %s', (field, value, code) => {
    expect(errors(createDivisionSchema, { ...valid, [field]: value })).toEqual({ [field]: code });
  });
});

describe('updateDivisionSchema', () => {
  const names = { nameAr: valid.nameAr, nameEn: valid.nameEn, sortOrder: valid.sortOrder };

  it('reads the id, the names, and the order, and ignores a submitted code', () => {
    expect(
      updateDivisionSchema.parse({ ...names, divisionId: ` ${ID} `, divisionCode: 'X' }),
    ).toEqual({
      divisionId: ID,
      nameAr: 'هندسة البرمجيات',
      nameEn: 'Software Engineering',
      sortOrder: 3,
    });
  });

  it.each([
    ['divisionId', undefined, 'required'],
    ['divisionId', ' ', 'required'],
    ['divisionId', 'x'.repeat(65), 'too_long'],
    ['nameEn', '', 'required'],
    ['sortOrder', '10000', 'out_of_range'],
  ])('refuses %s = %j with %s', (field, value, code) => {
    const parsed = updateDivisionSchema.safeParse({ ...names, divisionId: ID, [field]: value });
    expect(parsed.success ? {} : fieldErrorsOf(parsed.error)).toEqual({ [field]: code });
  });
});

describe('setDivisionActiveSchema', () => {
  it('reads "true" and "false" as booleans', () => {
    expect(setDivisionActiveSchema.parse({ divisionId: ID, isActive: 'true' })).toEqual({
      divisionId: ID,
      isActive: true,
    });
    expect(setDivisionActiveSchema.parse({ divisionId: ID, isActive: ' false ' }).isActive).toBe(
      false,
    );
  });

  it.each([
    ['isActive', 'yes', 'invalid_choice'],
    ['isActive', 'TRUE', 'invalid_choice'],
    ['isActive', undefined, 'invalid_choice'],
    ['divisionId', '', 'required'],
  ])('refuses %s = %j with %s', (field, value, code) => {
    const parsed = setDivisionActiveSchema.safeParse({
      divisionId: ID,
      isActive: 'true',
      [field]: value,
    });
    expect(parsed.success ? {} : fieldErrorsOf(parsed.error)).toEqual({ [field]: code });
  });
});
