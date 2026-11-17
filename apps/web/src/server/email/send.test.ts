import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail, type EmailMessage } from './send';

const deliver = vi.fn<(message: EmailMessage) => Promise<void>>();

vi.mock('./transport', () => ({ getEmailTransport: () => ({ deliver }) }));

const MESSAGE: EmailMessage = {
  template: 'invitation',
  to: 'invitee@example.edu',
  subject: 'دعوة | Invitation',
  text: 'text',
  html: '<p>html</p>',
};

afterEach(() => {
  deliver.mockReset();
});

describe('sendEmail', () => {
  it('hands the message to the configured transport', async () => {
    deliver.mockResolvedValue(undefined);
    await sendEmail(MESSAGE);
    expect(deliver).toHaveBeenCalledWith(MESSAGE);
  });

  it('throws when the transport fails', async () => {
    deliver.mockRejectedValue(new Error('smtp down'));
    await expect(sendEmail(MESSAGE)).rejects.toThrow('smtp down');
  });
});
