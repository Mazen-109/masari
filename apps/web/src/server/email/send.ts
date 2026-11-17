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

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getEmailTransport().deliver(message);
}
