import { z } from 'zod';
import { localeLessNext } from '@/lib/safe-next';

/**
 * Field rules of contracts/server-actions.md §3 for the account forms. Every issue message is a
 * `FieldErrorCode`; `parseForm` (lib/form.ts) keeps the first one per field.
 */

const TENANT_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * Bidirectional embedding/override (U+202A–U+202E) and isolate (U+2066–U+2069) controls: in a name they
 * can reorder the text around it wherever the name is shown (screens, emails, lists). The joiners
 * U+200C (ZWNJ) and U+200D (ZWJ) are ordinary parts of Arabic and Persian names and stay allowed. The
 * directional marks LRM (U+200E), RLM (U+200F), and ALM (U+061C) are deliberately allowed too: they only
 * affect the neighbouring characters, never the text around the name, and fix mixed Arabic/Latin names.
 */
export const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

/** Trimmed, 2–100 characters, no control characters (line breaks, tabs, NUL, …) or bidi controls. */
export const nameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .min(2, { error: 'too_short' })
  .max(100, { error: 'too_long' })
  .refine((value) => !CONTROL_CHARACTER.test(value) && !BIDI_CONTROL.test(value), {
    error: 'invalid_format',
  });

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

/** "Send the confirmation email again" (contracts/server-actions.md §4.2). */
export const resendSchema = z.object({
  email: emailField,
});

export type ResendInput = z.infer<typeof resendSchema>;

/**
 * Sign-in (contracts/server-actions.md §3, §4.3). The password is the stored one: not trimmed and only
 * `required` here; a value over 128 characters is refused by the auth library (`maxPasswordLength`) and
 * ends as the same generic `invalid_credentials`. `next` never fails validation: a value `safeNext`
 * refuses (missing, `//evil.test`, a scheme, …) becomes null and is ignored.
 */
export const signInSchema = z.object({
  email: emailField,
  password: z.string({ error: 'required' }).min(1, { error: 'required' }),
  next: z
    .unknown()
    .optional()
    .transform((value) => localeLessNext(value)),
});

export type SignInInput = z.infer<typeof signInSchema>;

/** "Forgot your password?" (contracts/server-actions.md §4.5). */
export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * The reset token from the emailed link (the auth library makes it of 24 letters and digits). Only its
 * shape is checked here; whether it is valid, unexpired, and unused is decided by the library.
 */
const RESET_TOKEN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Setting a new password from the emailed link (contracts/server-actions.md §4.6). The action reports a
 * missing or malformed `token` as `token_invalid`, never as a field error (the field is hidden).
 */
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .regex(RESET_TOKEN, { error: 'invalid_format' }),
  password: newPasswordField,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** An invitation link token: 32 random bytes in base64url without padding (packages/db tokens.ts). */
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Accepting an invitation (contracts/server-actions.md §4.7). The email and the role come from the
 * invitation, never from the form. The action reports a missing or malformed `token` (a hidden field) as
 * `token_invalid`, never as a field error.
 */
export const acceptInvitationSchema = z.object({
  token: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .regex(INVITATION_TOKEN, { error: 'invalid_format' }),
  name: nameField,
  password: newPasswordField,
  consent: consentField,
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
