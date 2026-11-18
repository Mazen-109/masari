import { ROLES } from '@masari/db';
import { z } from 'zod';
import { emailField } from '@/features/auth/schemas';

/**
 * Field rules of contracts/server-actions.md §3 for the invitations screen (FR-020). Every issue message is
 * a `FieldErrorCode`; `parseForm` (lib/form.ts) keeps the first one per field.
 */

/** One of the four roles, trimmed; anything else (also a missing value) is `invalid_choice`. */
export const roleField = z
  .string({ error: 'invalid_choice' })
  .trim()
  .pipe(z.enum(ROLES, { error: 'invalid_choice' }));

/** The invite form (contracts/server-actions.md §5.2 `createInvitationAction`). */
export const createInvitationSchema = z.object({
  email: emailField,
  role: roleField,
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * The revoke form (contracts/server-actions.md §5.2 `revokeInvitationAction`): the invitation's id, from a
 * hidden field. Only its presence and length are checked here; an id that is not a uuid is an unknown
 * invitation, which the action answers with `not_found`.
 */
export const revokeInvitationSchema = z.object({
  invitationId: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .max(64, { error: 'too_long' }),
});

export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>;
