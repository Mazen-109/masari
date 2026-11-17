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

  it.each([
    'a@x.test, b@y.test',
    'a@x.test;b@y.test',
    'Name <a@x.test>',
    'a@x.test>',
    'a @x.test',
    'a@x.test\n',
    'a@x.test\tb',
    'a@x.test\u0085b@y.test',
    'a@x.test ',
    '',
  ])('refuses the recipient %j without delivering or echoing it', async (to) => {
    await expect(sendEmail({ ...MESSAGE, to })).rejects.toThrow(/^Invalid email recipient$/);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('throws when the transport fails', async () => {
    deliver.mockRejectedValue(new Error('smtp down'));
    await expect(sendEmail(MESSAGE)).rejects.toThrow('smtp down');
  });
});
