import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DB_ENV_VARIABLES } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { ENV_VARIABLES, parseEnv } from './env';

// `.env.example` documents every variable the code reads (contracts/http-and-env.md §3; T145): set ones
// (`NAME=value`) and optional ones shown commented out (`# NAME=value`).

const EXAMPLE = readFileSync(
  fileURLToPath(new URL('../../../../.env.example', import.meta.url)),
  'utf8',
);
const LINE = /^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/;

const entries = EXAMPLE.split('\n').flatMap((line) => {
  const match = LINE.exec(line.trim());
  if (match === null) return [];
  const [, comment, name = '', raw = ''] = match;
  const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return [{ name, value, set: comment === undefined }];
});
const listed = new Set(entries.map(({ name }) => name));
const read = new Set([...ENV_VARIABLES, ...DB_ENV_VARIABLES]);

describe('.env.example', () => {
  it('lists every variable read by getEnv(), getDbEnv(), and getAdminDbEnv()', () => {
    expect([...read].filter((name) => !listed.has(name))).toEqual([]);
  });

  it('lists no variable that nothing reads', () => {
    expect([...listed].filter((name) => !read.has(name))).toEqual([]);
  });

  it('lists each variable once', () => {
    expect(entries.length).toBe(listed.size);
  });

  it('is a valid web environment as it stands', () => {
    const source = Object.fromEntries(
      entries.filter(({ set }) => set).map(({ name, value }) => [name, value]),
    );
    expect(() => parseEnv(source)).not.toThrow();
  });

  it('knows the variables of both packages (the lists are not empty)', () => {
    expect(ENV_VARIABLES).toContain('BETTER_AUTH_SECRET');
    expect(DB_ENV_VARIABLES).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'DATABASE_MIGRATION_URL']),
    );
  });
});
