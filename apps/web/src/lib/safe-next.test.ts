import { describe, expect, it } from 'vitest';
import { MAX_NEXT_LENGTH, safeNext } from './safe-next';

describe('safeNext', () => {
  it.each(['/dashboard?x=1', '/dashboard', '/', '/admin/users?page=2#top', '/modules/mueed'])(
    'accepts %j',
    (value) => {
      expect(safeNext(value)).toBe(value);
    },
  );

  it(`accepts a path of exactly ${MAX_NEXT_LENGTH} characters`, () => {
    const value = `/${'a'.repeat(MAX_NEXT_LENGTH - 1)}`;
    expect(safeNext(value)).toBe(value);
  });

  it.each([
    ['protocol-relative', '//evil'],
    ['protocol-relative with path', '//evil.example/dashboard'],
    ['backslash after the slash', '/\\evil'],
    ['backslash later in the path', '/dashboard\\..\\evil'],
    ['absolute URL', 'https://evil'],
    ['javascript scheme', 'javascript:'],
    ['javascript scheme with code', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,x'],
    ['relative path', 'dashboard'],
    ['empty', ''],
    ['tab that a browser would drop', '/\t/evil'],
    ['line break that a browser would drop', '/\n/evil'],
    ['carriage return', '/dashboard\r'],
    ['NUL character', '/dashboard\u0000'],
    ['longer than 512 characters', `/${'a'.repeat(MAX_NEXT_LENGTH)}`],
  ])('rejects %s', (_name, value) => {
    expect(safeNext(value)).toBeNull();
  });

  it.each([undefined, null, 42, ['/dashboard'], { path: '/dashboard' }])(
    'rejects the non-string %j',
    (value) => {
      expect(safeNext(value)).toBeNull();
    },
  );
});
