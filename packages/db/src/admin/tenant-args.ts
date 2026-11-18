import { parseArgs } from 'node:util';
import { z } from 'zod';
import { TENANT_STATUSES, type TenantStatus } from '../constants';

/**
 * Argument parsing for the operator tools `pnpm tenant:create` and `pnpm tenant:set-status`
 * (contracts/cli.md §4–6): node:util parseArgs, no CLI library. Pure, so the rules are unit-tested; the
 * scripts turn a failure into usage + the invalid argument on stderr and exit code 2. Messages name the
 * argument and its rule only, never the value given (it may be an email).
 */

export const TENANT_CREATE_USAGE =
  'Usage: pnpm tenant:create --slug <slug> --name-ar "<Arabic name>" --name-en "<English name>" --admin-email <email>';
export const TENANT_SET_STATUS_USAGE =
  'Usage: pnpm tenant:set-status --slug <slug> --status active|suspended';

/** Same rule as the `tenants_slug_check` constraint (data-model.md §3.1). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_RULE = '3–40 characters: lower-case letters and digits, separated by single hyphens';
const NAME_RULE = '1–120 characters';

export type ArgsResult<T> = { ok: true; value: T } | { ok: false; problem: string };

export interface TenantCreateArgs {
  slug: string;
  nameAr: string;
  nameEn: string;
  adminEmail: string;
}

export interface TenantSetStatusArgs {
  slug: string;
  status: TenantStatus;
}

export function isValidSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 40 && SLUG_PATTERN.test(value);
}

function isValidName(value: string): boolean {
  return value.length >= 1 && value.length <= 120;
}

const emailSchema = z.email();

type Options = Record<string, { type: 'string' }>;

/** Strict parse: unknown options, positionals, and options without a value are refused. */
function parseStrict(
  argv: readonly string[],
  options: Options,
): ArgsResult<Record<string, unknown>> {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options,
      strict: true,
      allowPositionals: false,
    });
    return { ok: true, value: values };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return { ok: false, problem: 'Unknown option' };
    if (code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL')
      return { ok: false, problem: 'Unexpected argument' };
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE')
      return { ok: false, problem: 'An option is missing its value' };
    return { ok: false, problem: 'Invalid arguments' };
  }
}

function text(values: Record<string, unknown>, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

function invalid(name: string, rule: string): { ok: false; problem: string } {
  return { ok: false, problem: `Invalid argument --${name}: ${rule}` };
}

export function parseTenantCreateArgs(argv: readonly string[]): ArgsResult<TenantCreateArgs> {
  const parsed = parseStrict(argv, {
    slug: { type: 'string' },
    'name-ar': { type: 'string' },
    'name-en': { type: 'string' },
    'admin-email': { type: 'string' },
  });
  if (!parsed.ok) return parsed;
  const slug = text(parsed.value, 'slug');
  const nameAr = text(parsed.value, 'name-ar')?.trim();
  const nameEn = text(parsed.value, 'name-en')?.trim();
  const adminEmail = text(parsed.value, 'admin-email')?.trim().toLowerCase();

  if (slug === undefined || !isValidSlug(slug)) return invalid('slug', SLUG_RULE);
  if (nameAr === undefined || !isValidName(nameAr)) return invalid('name-ar', NAME_RULE);
  if (nameEn === undefined || !isValidName(nameEn)) return invalid('name-en', NAME_RULE);
  if (adminEmail === undefined || !emailSchema.safeParse(adminEmail).success)
    return invalid('admin-email', 'a valid email address');
  return { ok: true, value: { slug, nameAr, nameEn, adminEmail } };
}

export function parseTenantSetStatusArgs(argv: readonly string[]): ArgsResult<TenantSetStatusArgs> {
  const parsed = parseStrict(argv, { slug: { type: 'string' }, status: { type: 'string' } });
  if (!parsed.ok) return parsed;
  const slug = text(parsed.value, 'slug');
  const status = text(parsed.value, 'status');
  if (slug === undefined || !isValidSlug(slug)) return invalid('slug', SLUG_RULE);
  const known = TENANT_STATUSES.find((item) => item === status);
  if (known === undefined) return invalid('status', TENANT_STATUSES.join(' or '));
  return { ok: true, value: { slug, status: known } };
}
