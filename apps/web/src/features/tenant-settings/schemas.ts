import { MODULE_KEYS } from '@masari/db';
import { z } from 'zod';
import { BIDI_CONTROL, CONTROL_CHARACTER } from '@/features/auth/schemas';
import { levelField } from '@/features/profile/schemas';
import { normaliseModules, parseDomains } from './rules';

/**
 * Field rules of the college settings form (contracts/server-actions.md §5.4; FR-032, FR-034;
 * data-model.md §3.1). Every issue message is a `FieldErrorCode`. "Not below the highest level in use" needs
 * the database and is checked by the action.
 */

/** Longest college name (CHECK constraint of data-model.md §3.1). */
export const MAX_COLLEGE_NAME_LENGTH = 120;

/**
 * Longest accepted domains text: room for 20 domains of the longest possible length (253 characters,
 * rules.ts `MAX_DOMAIN_LENGTH`), one per line with CRLF line breaks (20 × 255 = 5100), plus spare spacing.
 */
export const MAX_DOMAINS_TEXT_LENGTH = 6000;

/** Trimmed, 1–120 characters, no control characters (line breaks, tabs, …) or bidi controls. */
const collegeNameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .max(MAX_COLLEGE_NAME_LENGTH, { error: 'too_long' })
  .refine((value) => !CONTROL_CHARACTER.test(value) && !BIDI_CONTROL.test(value), {
    error: 'invalid_format',
  });

/** The textarea's text → the normalised list (rules.ts `parseDomains`); empty text → []. */
const domainsField = z
  .string({ error: 'required' })
  .max(MAX_DOMAINS_TEXT_LENGTH, { error: 'too_long' })
  .transform((text, ctx) => {
    const parsed = parseDomains(text);
    if (parsed.ok) return parsed.domains;
    ctx.addIssue({ code: 'custom', message: parsed.error });
    return z.NEVER;
  });

/** The checked boxes (every value of the repeated field) → module keys in registry order. */
const modulesField = z
  .array(z.string({ error: 'invalid_choice' }), { error: 'invalid_choice' })
  .max(MODULE_KEYS.length * 2, { error: 'invalid_choice' })
  .transform((values, ctx) => {
    const modules = normaliseModules(values);
    if (modules !== null) return modules;
    ctx.addIssue({ code: 'custom', message: 'invalid_choice' });
    return z.NEVER;
  });

/**
 * `enabledModules` repeats (one value per checked box): the action passes all its values
 * (`formData.getAll`), never through `parseForm`, which keeps one value per name.
 */
export const tenantSettingsSchema = z.object({
  nameAr: collegeNameField,
  nameEn: collegeNameField,
  allowedEmailDomains: domainsField,
  levelsCount: levelField,
  enabledModules: modulesField,
});

export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;
