import { MODULE_KEYS, type ModuleKey } from '@masari/db';

/** Pure rules of the college settings (FR-032, FR-034; data-model.md §3.1). */

/** The most allowed email domains a college may have (CHECK constraint of data-model.md §3.1). */
export const MAX_DOMAINS = 20;

/** A lower-case domain of at least two labels, each 1–63 letters, digits, or inner hyphens. */
export const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** The longest domain name (characters, without a trailing dot; RFC 1035 limits). */
export const MAX_DOMAIN_LENGTH = 253;

export type ParsedDomains =
  { ok: true; domains: string[] } | { ok: false; error: 'invalid_format' | 'too_many' };

/**
 * The allowed email domains typed in the settings form: one per line (spaces, commas, and semicolons also
 * separate them), each trimmed and lower-cased, duplicates dropped keeping the first. Empty text → no
 * restriction (an empty list). Any item that is not a domain (also one longer than 253 characters) →
 * `invalid_format`; more than 20 different
 * domains → `too_many`.
 */
export function parseDomains(text: string): ParsedDomains {
  const domains: string[] = [];
  for (const raw of text.split(/[\s,;]+/u)) {
    const item = raw.trim().toLowerCase();
    if (item === '') continue;
    if (item.length > MAX_DOMAIN_LENGTH || !DOMAIN.test(item))
      return { ok: false, error: 'invalid_format' };
    if (!domains.includes(item)) domains.push(item);
  }
  return domains.length > MAX_DOMAINS ? { ok: false, error: 'too_many' } : { ok: true, domains };
}

/** The checked module keys in registry order without duplicates; null when one is not a module key. */
export function normaliseModules(values: readonly string[]): ModuleKey[] | null {
  const known: readonly string[] = MODULE_KEYS;
  if (!values.every((value) => known.includes(value))) return null;
  return MODULE_KEYS.filter((key) => values.includes(key));
}

/** The editable settings of a college. */
export type TenantSettings = Readonly<{
  nameAr: string;
  nameEn: string;
  allowedEmailDomains: readonly string[];
  levelsCount: number;
  enabledModules: readonly ModuleKey[];
}>;

export type SettingsField = keyof TenantSettings;

/** Display and audit order of the settings fields. */
export const SETTINGS_FIELDS = [
  'nameAr',
  'nameEn',
  'allowedEmailDomains',
  'levelsCount',
  'enabledModules',
] as const satisfies readonly SettingsField[];

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** The fields whose value differs between `before` and `after`, in SETTINGS_FIELDS order. */
export function changedFields(before: TenantSettings, after: TenantSettings): SettingsField[] {
  return SETTINGS_FIELDS.filter((field) => {
    switch (field) {
      case 'allowedEmailDomains':
      case 'enabledModules':
        return !sameList(before[field], after[field]);
      default:
        return before[field] !== after[field];
    }
  });
}
