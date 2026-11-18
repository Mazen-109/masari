import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvError, parseEnv } from './env';

const SECRET = 'a-very-long-local-only-secret-value-0123456789';

const VALID = {
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://masari_web:runtime-pass@localhost:5432/masari',
  BETTER_AUTH_SECRET: SECRET,
  EMAIL_TRANSPORT: 'capture',
  EMAIL_FROM: 'Masari <no-reply@localhost>',
} as const;

const PRODUCTION = {
  ...VALID,
  APP_ENV: 'production',
  APP_URL: 'https://masari.example.edu',
  TRUSTED_PROXY_HOPS: '1',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.edu',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'smtp-pass-value',
} as const;

/** The variable names listed by the error, or [] when the source is valid. */
function invalidNames(source: Record<string, string | undefined>): readonly string[] {
  try {
    parseEnv(source);
    return [];
  } catch (error) {
    if (error instanceof EnvError) return error.variables;
    throw error;
  }
}

describe('parseEnv', () => {
  it('accepts the documented local development values and applies the defaults', () => {
    expect(parseEnv(VALID)).toEqual({
      ...VALID,
      TRUSTED_PROXY_HOPS: 0,
      EMAIL_CAPTURE_DIR: '.tmp/emails',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it('never exposes DATABASE_MIGRATION_URL to the web app', () => {
    const env = parseEnv({ ...VALID, DATABASE_MIGRATION_URL: 'postgres://o:p@localhost/masari' });
    expect(env).not.toHaveProperty('DATABASE_MIGRATION_URL');
  });

  it('accepts a valid production configuration', () => {
    expect(parseEnv(PRODUCTION)).toMatchObject({
      APP_ENV: 'production',
      TRUSTED_PROXY_HOPS: 1,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.edu',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it('parses SMTP_PORT, SMTP_SECURE, EMAIL_CAPTURE_DIR, and TRUSTED_PROXY_HOPS', () => {
    expect(
      parseEnv({
        ...PRODUCTION,
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        EMAIL_CAPTURE_DIR: '/var/tmp/mail',
        TRUSTED_PROXY_HOPS: '5',
      }),
    ).toMatchObject({
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      EMAIL_CAPTURE_DIR: '/var/tmp/mail',
      TRUSTED_PROXY_HOPS: 5,
    });
  });

  it('treats empty values as unset', () => {
    expect(parseEnv({ ...VALID, TRUSTED_PROXY_HOPS: '', EMAIL_CAPTURE_DIR: '' })).toMatchObject({
      TRUSTED_PROXY_HOPS: 0,
      EMAIL_CAPTURE_DIR: '.tmp/emails',
    });
    expect(invalidNames({ ...VALID, BETTER_AUTH_SECRET: '' })).toEqual(['BETTER_AUTH_SECRET']);
  });

  it('lists every missing required variable, sorted', () => {
    expect(invalidNames({})).toEqual([
      'APP_ENV',
      'APP_URL',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
      'EMAIL_FROM',
      'EMAIL_TRANSPORT',
    ]);
  });

  it.each([
    ['APP_ENV', 'staging'],
    ['APP_URL', 'not a url'],
    ['APP_URL', 'localhost:3000'],
    ['APP_URL', 'http://localhost:3000/'],
    ['APP_URL', 'http://localhost:3000/app'],
    ['APP_URL', 'ftp://localhost'],
    ['DATABASE_URL', 'not a url'],
    ['DATABASE_URL', 'mysql://u:p@localhost/masari'],
    ['DATABASE_URL', 'postgres://u:p@localhost:5432/'],
    ['BETTER_AUTH_SECRET', 'x'.repeat(31)],
    ['TRUSTED_PROXY_HOPS', '6'],
    ['TRUSTED_PROXY_HOPS', '-1'],
    ['TRUSTED_PROXY_HOPS', '1.5'],
    ['TRUSTED_PROXY_HOPS', 'one'],
    ['EMAIL_TRANSPORT', 'sendmail'],
    ['EMAIL_FROM', 'Masari <a@b>\r\nBcc: x@y'],
    ['SMTP_PORT', '0'],
    ['SMTP_PORT', '70000'],
    ['SMTP_SECURE', 'yes'],
  ])('rejects %s=%j', (name, value) => {
    expect(invalidNames({ ...VALID, [name]: value })).toEqual([name]);
  });

  it('accepts a BETTER_AUTH_SECRET of exactly 32 characters', () => {
    expect(invalidNames({ ...VALID, BETTER_AUTH_SECRET: 'x'.repeat(32) })).toEqual([]);
  });

  it('names BETTER_AUTH_SECRET but never its value', () => {
    const value = 'short-secret-value';
    let message = '';
    try {
      parseEnv({ ...VALID, BETTER_AUTH_SECRET: value });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('Invalid environment variables: BETTER_AUTH_SECRET');
    expect(message).not.toContain(value);
  });

  it('never puts a database password into the message', () => {
    expect(() =>
      parseEnv({ ...VALID, DATABASE_URL: 'mysql://u:very-secret-password@localhost/masari' }),
    ).toThrow(/^Invalid environment variables: DATABASE_URL$/);
  });

  it('requires SMTP_HOST, SMTP_USER, and SMTP_PASSWORD when EMAIL_TRANSPORT=smtp', () => {
    expect(invalidNames({ ...VALID, EMAIL_TRANSPORT: 'smtp' })).toEqual([
      'SMTP_HOST',
      'SMTP_PASSWORD',
      'SMTP_USER',
    ]);
  });

  describe('production rules', () => {
    it('rejects EMAIL_TRANSPORT=capture', () => {
      expect(invalidNames({ ...PRODUCTION, EMAIL_TRANSPORT: 'capture' })).toEqual([
        'EMAIL_TRANSPORT',
      ]);
    });

    it('requires an https APP_URL', () => {
      expect(invalidNames({ ...PRODUCTION, APP_URL: 'http://masari.example.edu' })).toEqual([
        'APP_URL',
      ]);
    });

    it('requires TRUSTED_PROXY_HOPS ≥ 1 (the default 0 is refused)', () => {
      expect(invalidNames({ ...PRODUCTION, TRUSTED_PROXY_HOPS: undefined })).toEqual([
        'TRUSTED_PROXY_HOPS',
      ]);
      expect(invalidNames({ ...PRODUCTION, TRUSTED_PROXY_HOPS: '0' })).toEqual([
        'TRUSTED_PROXY_HOPS',
      ]);
    });

    it('does not apply to development or test', () => {
      expect(invalidNames({ ...VALID, APP_ENV: 'test' })).toEqual([]);
      expect(invalidNames(VALID)).toEqual([]);
    });
  });
});

describe('getEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function freshGetEnv() {
    vi.resetModules();
    return (await import('./env')).getEnv;
  }

  it('is lazy: importing the module reads nothing', async () => {
    vi.stubEnv('APP_ENV', 'invalid');
    vi.resetModules();
    await expect(import('./env')).resolves.toHaveProperty('getEnv');
  });

  it('reads process.env on first call and memoises the result', async () => {
    for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);
    const getEnv = await freshGetEnv();
    const first = getEnv();
    expect(first.APP_URL).toBe('http://localhost:3000');
    vi.stubEnv('APP_URL', 'http://changed.example');
    expect(getEnv()).toBe(first);
  });

  it('throws EnvError on an invalid environment and does not memoise the failure', async () => {
    for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);
    vi.stubEnv('BETTER_AUTH_SECRET', 'too-short');
    const getEnv = await freshGetEnv();
    expect(() => getEnv()).toThrow('Invalid environment variables: BETTER_AUTH_SECRET');
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
    expect(getEnv().BETTER_AUTH_SECRET).toBe(SECRET);
  });
});
