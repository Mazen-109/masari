import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../env';
import type { EmailMessage } from './send';
import {
  createCaptureTransport,
  createEmailTransport,
  createSmtpTransport,
  firstUrl,
  type CapturedEmailFile,
  type SmtpOptions,
} from './transport';

const MESSAGE: EmailMessage = {
  template: 'verify-email',
  to: 'student@example.edu',
  subject: 'تأكيد | Confirm',
  text: 'مرحبًا\n\nhttps://masari.test/api/auth/verify-email?token=secret-token\n\nHello',
  html: '<p>html</p>',
};

const FROM = 'Masari <no-reply@localhost>';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'masari-email-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/** Every console and stdout write during `run`, as one string. */
async function captureOutput(run: () => Promise<void>): Promise<{ log: string; stdout: string }> {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  vi.spyOn(console, 'log').mockImplementation(record);
  vi.spyOn(console, 'warn').mockImplementation(record);
  vi.spyOn(console, 'error').mockImplementation(record);
  const stdout: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  await run();
  vi.restoreAllMocks();
  return { log: lines.join('\n'), stdout: stdout.join('') };
}

describe('firstUrl', () => {
  it('returns the first http(s) URL of a text, or undefined', () => {
    expect(firstUrl('a\nhttp://x.test/a?b=1\nhttps://y.test')).toBe('http://x.test/a?b=1');
    expect(firstUrl('no link here')).toBeUndefined();
  });
});

describe('capture transport', () => {
  it('writes one JSON file per message and logs only the template name', async () => {
    const now = new Date('2026-11-17T08:00:00.000Z');
    const transport = createCaptureTransport({
      dir,
      from: FROM,
      printLinks: false,
      now: () => now,
    });

    const output = await captureOutput(async () => {
      await transport.deliver(MESSAGE);
      await transport.deliver({ ...MESSAGE, template: 'reset-password' });
    });

    const files = (await readdir(dir)).sort();
    expect(files).toHaveLength(2);
    for (const name of files) expect(name).toMatch(/^1794902400000-[0-9a-f]{8}\.json$/);

    const contents = await Promise.all(
      files.map(
        async (name) => JSON.parse(await readFile(path.join(dir, name), 'utf8')) as unknown,
      ),
    );
    expect(contents).toContainEqual({
      template: 'verify-email',
      to: MESSAGE.to,
      from: FROM,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
      createdAt: '2026-11-17T08:00:00.000Z',
    } satisfies CapturedEmailFile);

    const logLines = output.log
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logLines.map(({ event, template }) => ({ event, template }))).toEqual([
      { event: 'email.captured', template: 'verify-email' },
      { event: 'email.captured', template: 'reset-password' },
    ]);
    // No address, subject, body, or link reaches the logs.
    expect(output.log).not.toContain('@');
    expect(output.log).not.toContain('token');
    expect(output.log).not.toContain('Confirm');
    expect(output.stdout).toBe('');
  });

  it('creates the capture directory when it is missing', async () => {
    const nested = path.join(dir, 'a', 'b');
    const transport = createCaptureTransport({ dir: nested, from: FROM, printLinks: false });
    await captureOutput(() => transport.deliver(MESSAGE));
    expect(await readdir(nested)).toHaveLength(1);
  });

  it('prints the first link in development only', async () => {
    const transport = createCaptureTransport({ dir, from: FROM, printLinks: true });
    const output = await captureOutput(() => transport.deliver(MESSAGE));
    expect(output.stdout).toBe(
      '[dev email link] https://masari.test/api/auth/verify-email?token=secret-token\n',
    );
    expect(output.log).not.toContain('token');

    const withoutLink = await captureOutput(() =>
      transport.deliver({ ...MESSAGE, text: 'no link' }),
    );
    expect(withoutLink.stdout).toBe('');
  });
});

const BASE_ENV = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://masari_web:runtime-pass@localhost:5432/masari',
  BETTER_AUTH_SECRET: 'a-very-long-local-only-secret-value-0123456789',
  EMAIL_FROM: FROM,
};

describe('createEmailTransport', () => {
  it.each(['test', 'development'] as const)(
    'with APP_ENV=%s writes under EMAIL_CAPTURE_DIR resolved against the working directory',
    async (appEnv) => {
      const env = parseEnv({
        ...BASE_ENV,
        APP_ENV: appEnv,
        EMAIL_TRANSPORT: 'capture',
        EMAIL_CAPTURE_DIR: 'out/emails',
      });
      const transport = createEmailTransport(env, dir);
      const output = await captureOutput(() => transport.deliver(MESSAGE));
      expect(await readdir(path.join(dir, 'out', 'emails'))).toHaveLength(1);
      // Nothing is printed to the terminal with APP_ENV=test (contracts/emails.md §1).
      if (appEnv === 'test') expect(output.stdout).toBe('');
      else expect(output.stdout).toContain('[dev email link] https://masari.test/');
    },
  );

  it('builds the SMTP transport from the SMTP variables without connecting', () => {
    const env = parseEnv({
      ...BASE_ENV,
      APP_ENV: 'development',
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.edu',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'smtp-pass-value',
    });
    expect(createEmailTransport(env, dir)).toHaveProperty('deliver');
  });
});

describe('smtp transport', () => {
  const SMTP_ENV = {
    EMAIL_FROM: FROM,
    SMTP_HOST: 'smtp.example.edu',
    SMTP_PORT: 465,
    SMTP_USER: 'mailer',
    SMTP_PASSWORD: 'smtp-pass-value',
    SMTP_SECURE: true,
  };

  it('maps the SMTP variables and sends from EMAIL_FROM', async () => {
    const sendMail = vi.fn(() => Promise.resolve({}));
    let options: SmtpOptions | undefined;
    const transport = createSmtpTransport(SMTP_ENV, (given) => {
      options = given;
      return { sendMail };
    });
    expect(options).toEqual({
      host: 'smtp.example.edu',
      port: 465,
      secure: true,
      auth: { user: 'mailer', pass: 'smtp-pass-value' },
    });

    await transport.deliver(MESSAGE);
    expect(sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it('propagates a delivery failure', async () => {
    const transport = createSmtpTransport(SMTP_ENV, () => ({
      sendMail: () => Promise.reject(new Error('connection refused')),
    }));
    await expect(transport.deliver(MESSAGE)).rejects.toThrow('connection refused');
  });

  it('refuses to build without host, user, or password', () => {
    expect(() =>
      createSmtpTransport({ ...SMTP_ENV, SMTP_PASSWORD: undefined }, () => ({
        sendMail: () => Promise.resolve({}),
      })),
    ).toThrow('SMTP transport is not configured');
  });
});
