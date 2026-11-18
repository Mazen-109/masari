import { describe, expect, it } from 'vitest';
import {
  changedFields,
  MAX_DOMAIN_LENGTH,
  MAX_DOMAINS,
  normaliseModules,
  parseDomains,
  type TenantSettings,
} from './rules';

// FR-032, FR-034; data-model.md §3.1 (domain pattern, ≤ 20, de-duplication, registry order).

describe('parseDomains', () => {
  it('reads one domain per line, trimmed and lower-cased', () => {
    expect(parseDomains('  Example.EDU \r\nfci.cu.edu.eg\n')).toEqual({
      ok: true,
      domains: ['example.edu', 'fci.cu.edu.eg'],
    });
  });

  it('also splits on spaces, commas, and semicolons, and skips empty items', () => {
    expect(parseDomains('a.edu, b.edu;c.edu  d.edu\n\n,')).toEqual({
      ok: true,
      domains: ['a.edu', 'b.edu', 'c.edu', 'd.edu'],
    });
  });

  it('turns empty or blank text into no restriction', () => {
    expect(parseDomains('')).toEqual({ ok: true, domains: [] });
    expect(parseDomains(' \n\t ')).toEqual({ ok: true, domains: [] });
  });

  it('drops duplicates (after lower-casing), keeping the first', () => {
    expect(parseDomains('b.edu\nA.edu\nB.EDU\na.edu')).toEqual({
      ok: true,
      domains: ['b.edu', 'a.edu'],
    });
  });

  it.each([
    'example',
    '@example.edu',
    'x@example.edu',
    '-a.edu',
    'a-.edu',
    'a.-edu',
    'a..edu',
    '.example.edu',
    'example.edu.',
    'exa_mple.edu',
    'جامعة.مصر',
    `${'a'.repeat(64)}.edu`,
    'https://example.edu',
  ])('refuses %j with invalid_format', (item) => {
    expect(parseDomains(`ok.edu\n${item}`)).toEqual({ ok: false, error: 'invalid_format' });
  });

  it('accepts labels of 63 characters, digits, and inner hyphens', () => {
    const label = 'a'.repeat(63);
    expect(parseDomains(`${label}.edu\nfci-2.cu.edu.eg\n123.example`)).toEqual({
      ok: true,
      domains: [`${label}.edu`, 'fci-2.cu.edu.eg', '123.example'],
    });
  });

  it('accepts a domain of 253 characters and refuses one of 254 with invalid_format', () => {
    // Four labels of 63 characters and three dots: 255 characters; trim to exactly 253 and 254.
    const label = 'a'.repeat(63);
    const longest = `${label}.${label}.${label}.${'b'.repeat(61)}`;
    const tooLong = `${label}.${label}.${label}.${'b'.repeat(62)}`;
    expect(longest).toHaveLength(MAX_DOMAIN_LENGTH);
    expect(tooLong).toHaveLength(MAX_DOMAIN_LENGTH + 1);
    expect(parseDomains(longest)).toEqual({ ok: true, domains: [longest] });
    expect(parseDomains(`example.edu\n${tooLong}`)).toEqual({
      ok: false,
      error: 'invalid_format',
    });
  });

  it('accepts 20 different domains and refuses 21 with too_many, counting after de-duplication', () => {
    const domains = Array.from({ length: MAX_DOMAINS }, (_, index) => `d${index}.edu`);
    expect(parseDomains([...domains, 'd0.edu'].join('\n'))).toEqual({ ok: true, domains });
    expect(parseDomains([...domains, 'extra.edu'].join('\n'))).toEqual({
      ok: false,
      error: 'too_many',
    });
  });
});

describe('normaliseModules', () => {
  it('returns the checked modules in registry order, without duplicates', () => {
    expect(normaliseModules(['tadreeb', 'mueed', 'kitabi', 'mueed'])).toEqual([
      'mueed',
      'kitabi',
      'tadreeb',
    ]);
  });

  it('accepts none checked', () => {
    expect(normaliseModules([])).toEqual([]);
  });

  it('refuses an unknown key', () => {
    expect(normaliseModules(['mueed', 'payments'])).toBeNull();
    expect(normaliseModules(['MUEED'])).toBeNull();
  });
});

describe('changedFields', () => {
  const before: TenantSettings = {
    nameAr: 'كلية الحاسبات',
    nameEn: 'Faculty of Computing',
    allowedEmailDomains: ['a.edu', 'b.edu'],
    levelsCount: 4,
    enabledModules: ['mueed', 'kitabi'],
  };

  it('is empty when nothing differs (arrays compared by content)', () => {
    expect(
      changedFields(before, {
        ...before,
        allowedEmailDomains: ['a.edu', 'b.edu'],
        enabledModules: ['mueed', 'kitabi'],
      }),
    ).toEqual([]);
  });

  it('lists every changed field in a fixed order', () => {
    expect(
      changedFields(before, {
        enabledModules: ['mueed'],
        levelsCount: 5,
        allowedEmailDomains: [],
        nameEn: 'Computing',
        nameAr: 'كلية الحاسبات والمعلومات',
      }),
    ).toEqual(['nameAr', 'nameEn', 'allowedEmailDomains', 'levelsCount', 'enabledModules']);
  });

  it('counts a new order of the domains, or one more module, as a change', () => {
    expect(changedFields(before, { ...before, allowedEmailDomains: ['b.edu', 'a.edu'] })).toEqual([
      'allowedEmailDomains',
    ]);
    expect(
      changedFields(before, { ...before, enabledModules: ['mueed', 'kitabi', 'tadreeb'] }),
    ).toEqual(['enabledModules']);
  });
});
