import { z } from 'zod';

/**
 * Database configuration (contracts/http-and-env.md §3). Parsing is lazy: nothing is read at import time,
 * so importing any module of @masari/db never needs the environment. Error messages name the invalid
 * variables only — never their values, which contain passwords.
 */

type Source = Readonly<Record<string, string | undefined>>;

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

const httpOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !value.endsWith('/');
  } catch {
    return false;
  }
});

const dbEnvSchema = z.object({ DATABASE_URL: postgresUrl });

const adminDbEnvSchema = z.object({
  DATABASE_MIGRATION_URL: postgresUrl,
  DATABASE_URL: postgresUrl,
  APP_URL: httpOrigin.optional(),
  APP_ENV: z.enum(['development', 'test', 'production']).optional(),
});

/**
 * Every variable getDbEnv() and getAdminDbEnv() read — names only, never values (`.env.example` must list
 * each one: apps/web/src/server/env-example.test.ts).
 */
export const DB_ENV_VARIABLES: readonly string[] = [
  ...new Set([...Object.keys(dbEnvSchema.shape), ...Object.keys(adminDbEnvSchema.shape)]),
];

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type AdminDbEnv = z.infer<typeof adminDbEnvSchema>;

function parse<T>(schema: z.ZodType<T>, source: Source, label: string): T {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].sort();
  throw new Error(`Invalid ${label} environment variables: ${names.join(', ')}`);
}

export function parseDbEnv(source: Source): DbEnv {
  return parse(dbEnvSchema, source, 'database');
}

export function parseAdminDbEnv(source: Source): AdminDbEnv {
  return parse(adminDbEnvSchema, source, 'database admin');
}

/** Runtime connection settings (`DATABASE_URL`). */
export function getDbEnv(): DbEnv {
  return parseDbEnv(process.env);
}

/** Owner connection settings for scripts, tests, and e2e support. */
export function getAdminDbEnv(): AdminDbEnv {
  return parseAdminDbEnv(process.env);
}
