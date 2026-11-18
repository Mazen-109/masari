import { z } from 'zod';
import { BIDI_CONTROL, CONTROL_CHARACTER } from '@/features/auth/schemas';

/**
 * Field rules of the divisions screen (contracts/server-actions.md §5.5; FR-033; data-model.md §3.5). Every
 * issue message is a `FieldErrorCode`; `parseForm` (lib/form.ts) keeps the first one per field. "Unique in
 * the college" needs the database and is checked by the action (`code_taken`).
 */

/** Longest division code (CHECK constraint of data-model.md §3.5). */
export const MAX_DIVISION_CODE_LENGTH = 16;
/** Longest division name, in each language (CHECK constraint of data-model.md §3.5). */
export const MAX_DIVISION_NAME_LENGTH = 80;
/** Highest display order (CHECK constraint of data-model.md §3.5). */
export const MAX_SORT_ORDER = 9999;

/**
 * The stored form of a code (contracts/server-actions.md §5.5): 1–16 upper-case Latin letters, digits,
 * hyphens, and underscores — the same rule as the database CHECK constraint.
 */
export const DIVISION_CODE = /^[A-Z0-9_-]{1,16}$/;

/** What a user may type: the stored form in either letter case (ASCII only). */
const TYPED_DIVISION_CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Trimmed and upper-cased (`se` is stored as `SE`), 1–16 of A–Z, 0–9, `-`, `_`. Only ASCII letters are
 * accepted before upper-casing, and the upper-cased value is checked again against the stored form:
 * `toUpperCase()` can change the length or map a non-Latin letter onto A–Z (`ß` → `SS`, dotless `ı` → `I`),
 * which would otherwise pass here and fail the database CHECK constraint (an `internal` error).
 */
const divisionCodeField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .max(MAX_DIVISION_CODE_LENGTH, { error: 'too_long' })
  .regex(TYPED_DIVISION_CODE, { error: 'invalid_format' })
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(DIVISION_CODE, { error: 'invalid_format' }));

/** Trimmed, 1–80 characters, no control characters (line breaks, tabs, …) or bidi controls. */
const divisionNameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .max(MAX_DIVISION_NAME_LENGTH, { error: 'too_long' })
  .refine((value) => !CONTROL_CHARACTER.test(value) && !BIDI_CONTROL.test(value), {
    error: 'invalid_format',
  });

/** A whole number 0–9999 written with Western digits; an empty field is 0 (the first place). */
const sortOrderField = z
  .string({ error: 'invalid_format' })
  .trim()
  .transform((value) => (value === '' ? '0' : value))
  .pipe(z.string().regex(/^\d{1,6}$/, { error: 'invalid_format' }))
  .transform(Number)
  .pipe(z.number().int().max(MAX_SORT_ORDER, { error: 'out_of_range' }));

/**
 * The division's id, from a hidden field. Only its presence and length are checked: an id the college does
 * not have is an unknown division, which the action answers with `not_found`.
 */
const divisionIdField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .max(64, { error: 'too_long' });

/** The add form (`createDivisionAction`). */
export const createDivisionSchema = z.object({
  divisionCode: divisionCodeField,
  nameAr: divisionNameField,
  nameEn: divisionNameField,
  sortOrder: sortOrderField,
});

export type CreateDivisionInput = z.infer<typeof createDivisionSchema>;

/** The edit form (`updateDivisionAction`): names and order only — the code never changes. */
export const updateDivisionSchema = z.object({
  divisionId: divisionIdField,
  nameAr: divisionNameField,
  nameEn: divisionNameField,
  sortOrder: sortOrderField,
});

export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;

/** The activate / deactivate forms (`setDivisionActiveAction`): `isActive` is `"true"` or `"false"`. */
export const setDivisionActiveSchema = z.object({
  divisionId: divisionIdField,
  isActive: z
    .string({ error: 'invalid_choice' })
    .trim()
    .pipe(z.enum(['true', 'false'], { error: 'invalid_choice' }))
    .transform((value) => value === 'true'),
});

export type SetDivisionActiveInput = z.infer<typeof setDivisionActiveSchema>;
