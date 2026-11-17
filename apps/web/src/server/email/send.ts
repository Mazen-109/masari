import { getEmailTransport } from './transport';

/**
 * Transactional email entry point (contracts/emails.md §1). `template` names the template that produced
 * `subject`/`text`/`html` and is the only part of a message that may be logged; callers log
 * `email.sent` / `email.failed` with it. Throws when the transport fails.
 */

export type EmailTemplateName =
  'verify-email' | 'account-exists' | 'invitation-pending' | 'reset-password' | 'invitation';

export type EmailMessage = {
  template: EmailTemplateName;
  to: string;
  subject: string;
  text: string;
  html: string;
};

// Defence in depth behind the callers' Zod validation: one plain address only, so a value such as
// `a@x.test, b@y.test` or `Name <a@x.test>` can never reach a second or disguised recipient.
const UNSAFE_RECIPIENT = /[,;<>\s]/u;

/** True when `to` is a single bare address (non-empty, none of `,` `;` `<` `>` or whitespace). */
export function isSafeRecipient(to: string): boolean {
  return to.length > 0 && !UNSAFE_RECIPIENT.test(to);
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  // The address itself is never put into the error (logging contract).
  if (!isSafeRecipient(message.to)) throw new Error('Invalid email recipient');
  await getEmailTransport().deliver(message);
}
