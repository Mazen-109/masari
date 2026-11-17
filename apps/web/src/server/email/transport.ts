import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { getEnv, type Env } from '../env';
import { log } from '../log';
import type { EmailMessage } from './send';

/**
 * Email transports (contracts/emails.md §1), chosen by `EMAIL_TRANSPORT`:
 * - `smtp`: Nodemailer SMTP from the `SMTP_*` variables, `from` = `EMAIL_FROM`;
 * - `capture`: nothing is sent; each message becomes `<EMAIL_CAPTURE_DIR>/<epoch-ms>-<8 hex>.json` and one
 *   `email.captured` line with the template name only is logged.
 * Development link printing (the single exception to the logging contract, http-and-env.md §4): with
 * `APP_ENV=development` and `capture`, the first URL of the text is written to the terminal as a plain
 * line through `process.stdout.write` — never through `log`, never in `test` or `production`.
 */

export interface EmailTransport {
  deliver(message: EmailMessage): Promise<void>;
}

export type CapturedEmailFile = {
  template: EmailMessage['template'];
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  createdAt: string;
};

type CaptureOptions = {
  /** Absolute directory the JSON files are written to. */
  dir: string;
  from: string;
  /** True only for `APP_ENV=development`. */
  printLinks: boolean;
  now?: () => Date;
};

const URL_PATTERN = /https?:\/\/[^\s<>"]+/;

/** The first http(s) URL in a plain-text body, if any. */
export function firstUrl(text: string): string | undefined {
  return URL_PATTERN.exec(text)?.[0];
}

export function createCaptureTransport({
  dir,
  from,
  printLinks,
  now = () => new Date(),
}: CaptureOptions): EmailTransport {
  return {
    async deliver(message) {
      const createdAt = now();
      const file: CapturedEmailFile = {
        template: message.template,
        to: message.to,
        from,
        subject: message.subject,
        text: message.text,
        html: message.html,
        createdAt: createdAt.toISOString(),
      };
      await mkdir(dir, { recursive: true });
      const name = `${createdAt.getTime()}-${randomBytes(4).toString('hex')}.json`;
      await writeFile(path.join(dir, name), JSON.stringify(file, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
      log.info('email.captured', { template: message.template });
      if (printLinks) {
        const url = firstUrl(message.text);
        if (url !== undefined) process.stdout.write(`[dev email link] ${url}\n`);
      }
    },
  };
}

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
};

type SmtpMail = { from: string; to: string; subject: string; text: string; html: string };

/** The part of a Nodemailer transporter this module uses (lets tests avoid a real server). */
export type SmtpSender = { sendMail(mail: SmtpMail): Promise<unknown> };

type SmtpEnv = Pick<
  Env,
  'EMAIL_FROM' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'SMTP_SECURE'
>;

const nodemailerFactory = (options: SmtpOptions): SmtpSender => nodemailer.createTransport(options);

export function createSmtpTransport(
  env: SmtpEnv,
  factory: (options: SmtpOptions) => SmtpSender = nodemailerFactory,
): EmailTransport {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = env;
  // env.ts already requires these for `smtp`; this guard only narrows the types.
  if (host === undefined || user === undefined || pass === undefined) {
    throw new Error('SMTP transport is not configured');
  }
  const sender = factory({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user, pass },
  });
  return {
    async deliver(message) {
      await sender.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

/** The transport for a validated environment; the capture directory is resolved against `cwd`. */
export function createEmailTransport(env: Env, cwd: string): EmailTransport {
  if (env.EMAIL_TRANSPORT === 'smtp') return createSmtpTransport(env);
  return createCaptureTransport({
    dir: path.resolve(cwd, env.EMAIL_CAPTURE_DIR),
    from: env.EMAIL_FROM,
    printLinks: env.APP_ENV === 'development',
  });
}

let cached: EmailTransport | undefined;

/** The process-wide transport, created on first use (nothing is read at import time). */
export function getEmailTransport(): EmailTransport {
  cached ??= createEmailTransport(getEnv(), process.cwd());
  return cached;
}
