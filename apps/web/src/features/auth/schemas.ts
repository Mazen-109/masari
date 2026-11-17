import { z } from 'zod';

/**
 * Field rules of contracts/server-actions.md §3 for the account forms. Every issue message is a
 * `FieldErrorCode`; `parseForm` (lib/form.ts) keeps the first one per field.
 */

const TENANT_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Trimmed, 2–100 characters. */
export const nameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .min(2, { error: 'too_short' })
  .max(100, { error: 'too_long' });

/** Trimmed, lower-cased, ≤ 254 characters, a valid address. */
export const emailField = z
  .string({ error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'required' })
  .max(254, { error: 'too_long' })
  .pipe(z.email({ error: 'invalid_email' }));

/** A new password: 10–128 characters, not trimmed. */
export const newPasswordField = z
  .string({ error: 'required' })
  .min(1, { error: 'required' })
  .min(10, { error: 'password_too_short' })
  .max(128, { error: 'password_too_long' });

/** The privacy-notice checkbox: only the browser's `"on"` counts as consent. */
export const consentField = z.literal('on', { error: 'consent_required' });

/** A college slug: 3–40 characters of lower-case letters and digits in hyphen-separated groups. */
export const tenantSlugField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .min(3, { error: 'invalid_choice' })
  .max(40, { error: 'invalid_choice' })
  .regex(TENANT_SLUG, { error: 'invalid_choice' });

export const registerSchema = z.object({
  tenantSlug: tenantSlugField,
  name: nameField,
  email: emailField,
  password: newPasswordField,
  consent: consentField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
