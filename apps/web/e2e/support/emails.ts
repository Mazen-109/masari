import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapturedEmailFile } from '../../src/server/email/transport';
import { E2E_BASE_URL, E2E_EMAIL_CAPTURE_DIR } from './constants';

// Reads the messages the e2e server captured (contracts/emails.md §4). The server runs with
// `EMAIL_TRANSPORT=capture`, so no email ever leaves the machine; global-setup.ts empties the directory.

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURE_DIR = path.resolve(WEB_ROOT, E2E_EMAIL_CAPTURE_DIR);

const WAIT_MS = 10_000;
const POLL_MS = 200;

/** One captured message: the JSON file written by `src/server/email/transport.ts` (same type). */
export type CapturedEmail = CapturedEmailFile;

async function readAll(): Promise<CapturedEmail[]> {
  let names: string[];
  try {
    names = await readdir(CAPTURE_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const emails: CapturedEmail[] = [];
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    try {
      emails.push(
        JSON.parse(await readFile(path.join(CAPTURE_DIR, name), 'utf8')) as CapturedEmail,
      );
    } catch {
      // A file still being written is picked up by the next poll.
    }
  }
  return emails;
}

/** Messages to `to` (case-insensitive) created at or after `since`, newest first. */
async function messagesTo(to: string, since: Date): Promise<CapturedEmail[]> {
  const address = to.toLowerCase();
  return (await readAll())
    .filter(
      (email) =>
        email.to.toLowerCase() === address && Date.parse(email.createdAt) >= since.getTime(),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Polls the capture directory (up to 10 s) for the newest message to `to` whose subject contains
 *  `subjectIncludes`, created after `since`; returns it or throws. */
export async function waitForEmail(opts: {
  to: string;
  subjectIncludes: string;
  since: Date;
}): Promise<CapturedEmail> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const match = (await messagesTo(opts.to, opts.since)).find((email) =>
      email.subject.includes(opts.subjectIncludes),
    );
    if (match) return match;
    if (Date.now() >= deadline) {
      throw new Error(`No captured email matching "${opts.subjectIncludes}" within ${WAIT_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** First absolute URL in the message text that starts with APP_URL. */
export function firstLink(email: CapturedEmail): string {
  const link = email.text
    .split(/\s+/)
    .find((word) => word === E2E_BASE_URL || word.startsWith(`${E2E_BASE_URL}/`));
  if (link === undefined) {
    throw new Error(`The ${email.template} email has no link to ${E2E_BASE_URL}`);
  }
  return link;
}

/** Count of captured messages to an address since a time (to assert "no email was sent"). */
export async function countEmails(opts: { to: string; since: Date }): Promise<number> {
  return (await messagesTo(opts.to, opts.since)).length;
}
