import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminDbEnv, getDbEnv, parseAdminDbEnv, parseDbEnv } from './env';

const RUNTIME = 'postgres://app_user:runtime-secret@localhost:5432/masari';
const OWNER = 'postgresql://owner_user:owner-secret@localhost:5432/masari';

describe('parseDbEnv', () => {
  it('accepts a PostgreSQL URL', () => {
    expect(parseDbEnv({ DATABASE_URL: RUNTIME })).toEqual({ DATABASE_URL: RUNTIME });
  });

  it.each([
    ['missing', undefined],
    ['not a URL', 'not a url'],
    ['wrong protocol', 'mysql://u:p@localhost/masari'],
    ['no database name', 'postgres://u:p@localhost:5432/'],
  ])('rejects a %s DATABASE_URL and names only the variable', (_case, value) => {
    expect(() => parseDbEnv({ DATABASE_URL: value })).toThrow(
      'Invalid database environment variables: DATABASE_URL',
    );
  });

  it('never puts a value into the error message', () => {
    const leaky = 'mysql://u:very-secret-password@localhost/masari';
    let message = '';
    try {
      parseDbEnv({ DATABASE_URL: leaky });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('very-secret-password');
  });
});

describe('parseAdminDbEnv', () => {
  it('accepts both URLs and an optional APP_URL', () => {
    expect(parseAdminDbEnv({ DATABASE_MIGRATION_URL: OWNER, DATABASE_URL: RUNTIME })).toEqual({
      DATABASE_MIGRATION_URL: OWNER,
      DATABASE_URL: RUNTIME,
    });
    expect(
      parseAdminDbEnv({
        DATABASE_MIGRATION_URL: OWNER,
        DATABASE_URL: RUNTIME,
        APP_URL: 'http://localhost:3000',
      }).APP_URL,
    ).toBe('http://localhost:3000');
  });

  it('lists every invalid variable by name, sorted', () => {
    expect(() => parseAdminDbEnv({ DATABASE_URL: 'x', APP_URL: 'http://localhost:3000/' })).toThrow(
      'Invalid database admin environment variables: APP_URL, DATABASE_MIGRATION_URL, DATABASE_URL',
    );
  });

  it('rejects an APP_URL that is not http(s)', () => {
    expect(() =>
      parseAdminDbEnv({ DATABASE_MIGRATION_URL: OWNER, DATABASE_URL: RUNTIME, APP_URL: 'ftp://x' }),
    ).toThrow('APP_URL');
  });

  it('accepts an optional APP_ENV and rejects unknown values', () => {
    const base = { DATABASE_MIGRATION_URL: OWNER, DATABASE_URL: RUNTIME };
    expect(parseAdminDbEnv({ ...base, APP_ENV: 'production' }).APP_ENV).toBe('production');
    expect(() => parseAdminDbEnv({ ...base, APP_ENV: 'staging' })).toThrow(
      'Invalid database admin environment variables: APP_ENV',
    );
  });
});

describe('lazy getters', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('read process.env when called', () => {
    vi.stubEnv('DATABASE_URL', RUNTIME);
    vi.stubEnv('DATABASE_MIGRATION_URL', OWNER);
    expect(getDbEnv().DATABASE_URL).toBe(RUNTIME);
    expect(getAdminDbEnv().DATABASE_MIGRATION_URL).toBe(OWNER);
  });

  it('throw when a variable is missing', () => {
    vi.stubEnv('DATABASE_URL', undefined);
    expect(() => getDbEnv()).toThrow('DATABASE_URL');
  });
});
