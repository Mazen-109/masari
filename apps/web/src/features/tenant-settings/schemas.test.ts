import { describe, expect, it } from 'vitest';
import { fieldErrorsOf } from '@/lib/form';
import { MAX_DOMAINS_TEXT_LENGTH, tenantSettingsSchema } from './schemas';

// contracts/server-actions.md §5.4 field rules (FR-032, FR-034): every field error code of the form.

const valid = {
  nameAr: '  كلية الحاسبات  ',
  nameEn: ' Faculty of Computing ',
  allowedEmailDomains: 'Example.edu\nfci.example.edu',
  levelsCount: '5',
  enabledModules: ['kitabi', 'mueed'],
};

function errors(input: Record<string, unknown>) {
  const parsed = tenantSettingsSchema.safeParse(input);
  return parsed.success ? {} : fieldErrorsOf(parsed.error);
}

describe('tenantSettingsSchema', () => {
  it('trims the names, normalises the domains, reads the level count, and orders the modules', () => {
    expect(tenantSettingsSchema.parse(valid)).toEqual({
      nameAr: 'كلية الحاسبات',
      nameEn: 'Faculty of Computing',
      allowedEmailDomains: ['example.edu', 'fci.example.edu'],
      levelsCount: 5,
      enabledModules: ['mueed', 'kitabi'],
    });
  });

  it('accepts no domains and no modules', () => {
    expect(
      tenantSettingsSchema.parse({ ...valid, allowedEmailDomains: '', enabledModules: [] }),
    ).toMatchObject({ allowedEmailDomains: [], enabledModules: [] });
  });

  it('drops unknown fields such as slug and status', () => {
    const parsed = tenantSettingsSchema.parse({ ...valid, slug: 'hijack', status: 'suspended' });
    expect(Object.keys(parsed).sort()).toEqual([
      'allowedEmailDomains',
      'enabledModules',
      'levelsCount',
      'nameAr',
      'nameEn',
    ]);
  });

  it.each([
    ['nameAr', '   ', 'required'],
    ['nameAr', undefined, 'required'],
    ['nameEn', '', 'required'],
    ['nameAr', 'ك'.repeat(121), 'too_long'],
    ['nameEn', 'A'.repeat(121), 'too_long'],
    ['nameEn', 'Faculty\nof Computing', 'invalid_format'],
    ['nameAr', 'كلية ‮الحاسبات', 'invalid_format'],
    ['allowedEmailDomains', 'example.edu\nnot a domain@', 'invalid_format'],
    ['allowedEmailDomains', 'x'.repeat(MAX_DOMAINS_TEXT_LENGTH + 1), 'too_long'],
    [
      'allowedEmailDomains',
      Array.from({ length: 21 }, (_, index) => `d${index}.edu`).join('\n'),
      'too_many',
    ],
    ['allowedEmailDomains', undefined, 'required'],
    ['levelsCount', '0', 'out_of_range'],
    ['levelsCount', '8', 'out_of_range'],
    ['levelsCount', '2.5', 'out_of_range'],
    ['levelsCount', '', 'required'],
    ['enabledModules', ['mueed', 'payments'], 'invalid_choice'],
    ['enabledModules', 'mueed', 'invalid_choice'],
    ['enabledModules', Array.from({ length: 13 }, () => 'mueed'), 'invalid_choice'],
  ])('refuses %s = %j with %s', (field, value, code) => {
    expect(errors({ ...valid, [field]: value })).toEqual({ [field]: code });
  });

  it('accepts names of exactly 120 characters', () => {
    expect(
      tenantSettingsSchema.safeParse({ ...valid, nameAr: 'ك'.repeat(120), nameEn: 'A'.repeat(120) })
        .success,
    ).toBe(true);
  });
});
