import type { z } from 'zod';
import { fail, FIELD_ERROR_CODES, type ActionResult, type FieldErrorCode } from '@/lib/result';

/**
 * Step (2) of every form action (contracts/server-actions.md §1): parses the submitted fields with the
 * feature's Zod schema. Schemas use field error codes as their issue messages; the first issue of each
 * field becomes `fieldErrors[field]` and the result is `fail('validation')`. Unknown fields (including
 * the framework's own `$ACTION_…` fields) are dropped by the object schema.
 */

export type ParsedForm<T> = { ok: true; data: T } | { ok: false; failure: ActionResult<never> };

function asFieldErrorCode(message: string): FieldErrorCode {
  return (FIELD_ERROR_CODES as readonly string[]).includes(message)
    ? (message as FieldErrorCode)
    : 'invalid_format';
}

/** The first field error code per top-level field, from a Zod error. */
export function fieldErrorsOf(error: z.ZodError): Record<string, FieldErrorCode> {
  const fieldErrors: Record<string, FieldErrorCode> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || field in fieldErrors) continue;
    fieldErrors[field] = asFieldErrorCode(issue.message);
  }
  return fieldErrors;
}

/**
 * The submitted fields, one value per name. A name sent more than once (a forged duplicate, or a field
 * the page renders twice) counts with its **first** value, like `FormData.get`. Every reader of a form —
 * `parseForm` and anything that echoes entered values back — goes through this, so they always agree on
 * which value was submitted.
 */
export function formFields(formData: FormData): Record<string, FormDataEntryValue> {
  const fields = new Map<string, FormDataEntryValue>();
  for (const [key, value] of formData.entries()) {
    if (!fields.has(key)) fields.set(key, value);
  }
  // Object.fromEntries defines own properties, so a field named `__proto__` is just a field.
  return Object.fromEntries(fields);
}

export function parseForm<T>(schema: z.ZodType<T>, formData: FormData): ParsedForm<T> {
  const result = schema.safeParse(formFields(formData));
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, failure: fail('validation', { fieldErrors: fieldErrorsOf(result.error) }) };
}
