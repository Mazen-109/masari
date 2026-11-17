import { z } from 'zod';

/**
 * Field rules of contracts/server-actions.md §3 for the academic profile (FR-024–FR-026). Every issue
 * message is a `FieldErrorCode`; `parseForm` (lib/form.ts) keeps the first one per field. The college's
 * own limits (levels_count, active divisions) are checked by the action with `rules.ts`.
 */

/** Latin letters, digits, and hyphens, 3–20 characters (the CHECK constraint of data-model.md §3.6). */
export const STUDENT_CODE = /^[A-Za-z0-9-]{3,20}$/;

/** The highest level any college may have (data-model.md §3.6). */
export const MAX_LEVEL = 7;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const studentCodeField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .regex(STUDENT_CODE, { error: 'invalid_format' });

/** A whole number 1–7 written with Western digits; anything else is out of range. */
export const levelField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .regex(/^\d{1,2}$/, { error: 'out_of_range' })
  .transform(Number)
  .pipe(
    z.number().int().min(1, { error: 'out_of_range' }).max(MAX_LEVEL, { error: 'out_of_range' }),
  );

/** The id of one of the offered divisions (lower-cased, as PostgreSQL returns it). */
export const divisionIdField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .regex(UUID, { error: 'invalid_choice' })
  .transform((value) => value.toLowerCase());

/** The profile-completion form (contracts/server-actions.md §5.1 `completeStudentProfileAction`). */
export const studentProfileSchema = z.object({
  studentCode: studentCodeField,
  level: levelField,
  divisionId: divisionIdField,
});

export type StudentProfileFormInput = z.infer<typeof studentProfileSchema>;
