import { z } from 'zod';

/**
 * Web application configuration (contracts/http-and-env.md §3, research.md §19). Parsing is lazy and
 * memoised: nothing is read at import time, so `next build` runs without any variable, and
 * `instrumentation.ts` calls getEnv() once at server start. Error messages name the invalid variables only,
 * never their values. The web app never reads DATABASE_MIGRATION_URL.
 */

type Source = Readonly<Record<string, string | undefined>>;

const MAX_PROXY_HOPS = 5;

const postgresUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.pathname.length > 1
    );
  } catch {
    return false;
  }
});

/** An absolute http(s) origin: no path, query, fragment, or trailing slash. */
const httpOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
});

const integerString = (min: number, max: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));

const envFields = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: httpOrigin,
  DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  TRUSTED_PROXY_HOPS: integerString(0, MAX_PROXY_HOPS).default(0),
  EMAIL_TRANSPORT: z.enum(['capture', 'smtp']),
  // No line breaks: the value becomes a mail header.
  EMAIL_FROM: z.string().regex(/^[^\r\n]+$/),
  EMAIL_CAPTURE_DIR: z.string().default('.tmp/emails'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: integerString(1, 65_535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** Every variable getEnv() reads (`.env.example` must list each one: env-example.test.ts). */
export const ENV_VARIABLES: readonly string[] = Object.keys(envFields.shape);

const envSchema = envFields.superRefine((env, ctx) => {
  const invalid = (name: string) => ctx.addIssue({ code: 'custom', path: [name], message: '' });
  if (env.APP_ENV === 'production') {
    if (!env.APP_URL.startsWith('https://')) invalid('APP_URL');
    if (env.EMAIL_TRANSPORT === 'capture') invalid('EMAIL_TRANSPORT');
    if (env.TRUSTED_PROXY_HOPS < 1) invalid('TRUSTED_PROXY_HOPS');
  }
  if (env.EMAIL_TRANSPORT === 'smtp') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
      if (env[name] === undefined) invalid(name);
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Thrown when the environment is invalid; the message lists variable names only. */
export class EnvError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid environment variables: ${variables.join(', ')}`);
    this.name = 'EnvError';
    this.variables = variables;
  }
}

/** Pure parser behind getEnv(). Empty values count as unset (`NAME=` in a .env file). */
export function parseEnv(source: Source): Env {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(present);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].sort();
  throw new EnvError(names);
}

let cached: Env | undefined;

/** The validated environment, parsed on first call and memoised. Throws EnvError when invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
