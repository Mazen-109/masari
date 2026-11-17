import { describe, expect, it } from 'vitest';
import { isValidSlug, parseTenantCreateArgs, parseTenantSetStatusArgs } from './tenant-args';

const VALID = [
  '--slug',
  'sci-demo',
  '--name-ar',
  ' كلية العلوم ',
  '--name-en',
  'Faculty of Science',
  '--admin-email',
  ' Dean@Example.TEST ',
];

function replace(name: string, value: string): string[] {
  const args = [...VALID];
  args[args.indexOf(name) + 1] = value;
  return args;
}

function without(name: string): string[] {
  const args = [...VALID];
  args.splice(args.indexOf(name), 2);
  return args;
}

describe('isValidSlug', () => {
  it.each(['abc', 'sci-demo', 'a1-b2-c3', 'x'.repeat(40)])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(['ab', 'x'.repeat(41), 'Sci', 'sci_demo', '-sci', 'sci-', 'sci--demo', 'sci demo'])(
    'refuses %s',
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});

describe('parseTenantCreateArgs', () => {
  it('returns trimmed names and a trimmed, lower-cased email', () => {
    expect(parseTenantCreateArgs(VALID)).toEqual({
      ok: true,
      value: {
        slug: 'sci-demo',
        nameAr: 'كلية العلوم',
        nameEn: 'Faculty of Science',
        adminEmail: 'dean@example.test',
      },
    });
  });

  it.each<[string, string[], string]>([
    ['an invalid slug', replace('--slug', 'Not A Slug'), '--slug'],
    ['a missing slug', without('--slug'), '--slug'],
    ['an empty Arabic name', replace('--name-ar', '   '), '--name-ar'],
    ['a missing English name', without('--name-en'), '--name-en'],
    ['an English name over 120 characters', replace('--name-en', 'x'.repeat(121)), '--name-en'],
    ['an invalid email', replace('--admin-email', 'not-an-email'), '--admin-email'],
    ['a missing email', without('--admin-email'), '--admin-email'],
  ])('names the argument for %s', (_label, argv, name) => {
    const result = parseTenantCreateArgs(argv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(`Invalid argument ${name}:`);
  });

  it('never repeats the value given', () => {
    const result = parseTenantCreateArgs(replace('--admin-email', 'person-at-example.test'));
    expect(result).toEqual({
      ok: false,
      problem: 'Invalid argument --admin-email: a valid email address',
    });
  });

  it.each<[string, string[], string]>([
    ['an unknown option', [...VALID, '--force'], 'Unknown option'],
    ['a positional argument', [...VALID, 'extra'], 'Unexpected argument'],
    [
      'an option without a value',
      [...without('--admin-email'), '--admin-email'],
      'missing its value',
    ],
  ])('refuses %s', (_label, argv, problem) => {
    const result = parseTenantCreateArgs(argv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(problem);
  });
});

describe('parseTenantSetStatusArgs', () => {
  it.each(['active', 'suspended'] as const)('accepts --status %s', (status) => {
    expect(parseTenantSetStatusArgs(['--slug', 'sci-demo', '--status', status])).toEqual({
      ok: true,
      value: { slug: 'sci-demo', status },
    });
  });

  it.each<[string, string[], string]>([
    ['an unknown status', ['--slug', 'sci-demo', '--status', 'closed'], '--status'],
    ['a missing status', ['--slug', 'sci-demo'], '--status'],
    ['an invalid slug', ['--slug', 'SCI', '--status', 'active'], '--slug'],
  ])('names the argument for %s', (_label, argv, name) => {
    const result = parseTenantSetStatusArgs(argv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(`Invalid argument ${name}:`);
  });

  it('refuses unknown options', () => {
    expect(parseTenantSetStatusArgs(['--slug', 'sci-demo', '--status', 'active', '--all'])).toEqual(
      { ok: false, problem: 'Unknown option' },
    );
  });
});
