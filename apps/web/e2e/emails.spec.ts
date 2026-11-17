import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_BASE_URL, E2E_EMAIL_CAPTURE_DIR } from './support/constants';
import { countEmails, firstLink, waitForEmail, type CapturedEmail } from './support/emails';
import { expect, test } from './support/fixtures';

// The capture-directory helpers of e2e/support/emails.ts (contracts/emails.md §4), exercised with
// files in the format of src/server/email/transport.ts. Each test uses its own addresses.

const CAPTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  E2E_EMAIL_CAPTURE_DIR,
);

const address = () => `e2e-${randomUUID()}@example.test`;

type CaptureInput = Partial<Omit<CapturedEmail, 'createdAt'>> & { to: string; createdAt: Date };

async function capture(email: CaptureInput) {
  const file: CapturedEmail = {
    template: 'verify-email',
    from: 'Masari <no-reply@localhost>',
    subject: 'تأكيد | Confirm',
    text: 'no link',
    html: '<p></p>',
    ...email,
    createdAt: email.createdAt.toISOString(),
  };
  await mkdir(CAPTURE_DIR, { recursive: true });
  const name = `${email.createdAt.getTime()}-${randomUUID().slice(0, 8)}.json`;
  await writeFile(path.join(CAPTURE_DIR, name), JSON.stringify(file), 'utf8');
}

test('waitForEmail returns the newest matching message and firstLink its app link', async () => {
  const to = address();
  const since = new Date();
  await capture({ to, createdAt: new Date(since.getTime() - 60_000), subject: 'Old | Confirm' });
  await capture({
    to,
    createdAt: new Date(since.getTime() + 1),
    subject: 'First | Confirm',
    text: `x\n\nhttps://elsewhere.test/a\n${E2E_BASE_URL}/ar/first\n`,
  });
  await capture({
    to: to.toUpperCase(),
    createdAt: new Date(since.getTime() + 2),
    subject: 'Second | Confirm',
    text: `x\n${E2E_BASE_URL}/api/auth/verify-email?token=abc&callbackURL=/ar/email-verified\n`,
  });
  await capture({ to: address(), createdAt: new Date(since.getTime() + 3) });

  const email = await waitForEmail({ to, subjectIncludes: 'Confirm', since });
  expect(email.subject).toBe('Second | Confirm');
  expect(firstLink(email)).toBe(
    `${E2E_BASE_URL}/api/auth/verify-email?token=abc&callbackURL=/ar/email-verified`,
  );
  expect(await countEmails({ to, since })).toBe(2);
});

test('waitForEmail picks up a message written while it polls', async () => {
  const to = address();
  const since = new Date();
  const waiting = waitForEmail({ to, subjectIncludes: 'Late', since });
  setTimeout(() => void capture({ to, createdAt: new Date(), subject: 'Late | Late' }), 500);
  await expect(waiting).resolves.toMatchObject({ to, subject: 'Late | Late' });
});

test('countEmails is 0 and firstLink throws when nothing matches', async () => {
  const to = address();
  expect(await countEmails({ to, since: new Date() })).toBe(0);
  expect(() =>
    firstLink({
      template: 'invitation-pending',
      to,
      from: '',
      subject: '',
      text: 'https://elsewhere.test/a',
      html: '',
      createdAt: new Date().toISOString(),
    }),
  ).toThrow('has no link');
});
