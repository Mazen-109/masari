import { describe, expect, it } from 'vitest';
import { emailDomain, isEmailDomainAllowed, normalizeEmail, pickCollege } from './rules';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Mona.Ali@Example.EDU ')).toBe('mona.ali@example.edu');
  });
});

describe('emailDomain', () => {
  it('returns the normalised part after the last @', () => {
    expect(emailDomain('Mona@Sci.Example.EDU')).toBe('sci.example.edu');
    expect(emailDomain('"a@b"@example.edu')).toBe('example.edu');
  });

  it('is empty without an @', () => {
    expect(emailDomain('not-an-address')).toBe('');
  });
});

describe('isEmailDomainAllowed', () => {
  it('allows every domain when the list is empty', () => {
    expect(isEmailDomainAllowed('a@anything.test', [])).toBe(true);
  });

  it('matches a listed domain case-insensitively', () => {
    expect(isEmailDomainAllowed('a@STUD.example.edu', ['stud.example.edu'])).toBe(true);
    expect(isEmailDomainAllowed('a@stud.example.edu', ['other.edu', 'Stud.Example.Edu'])).toBe(
      true,
    );
  });

  it('refuses another domain', () => {
    expect(isEmailDomainAllowed('a@gmail.com', ['example.edu'])).toBe(false);
  });

  it('does not treat a sub-domain or a parent domain as a match', () => {
    expect(isEmailDomainAllowed('a@stud.example.edu', ['example.edu'])).toBe(false);
    expect(isEmailDomainAllowed('a@example.edu', ['stud.example.edu'])).toBe(false);
    expect(isEmailDomainAllowed('a@evilexample.edu', ['example.edu'])).toBe(false);
  });

  it('refuses an address without a domain when a list is set', () => {
    expect(isEmailDomainAllowed('no-at-sign', ['example.edu'])).toBe(false);
  });
});

describe('pickCollege', () => {
  const demo = { slug: 'demo', name: 'Demo' };
  const other = { slug: 'other', name: 'Other' };
  const cases: [string, (typeof demo)[], string | string[] | undefined, typeof demo | null][] = [
    ['u matches', [demo, other], 'other', other],
    ['u unknown, one college', [demo], 'unknown', demo],
    ['u unknown, several colleges', [demo, other], 'unknown', null],
    ['no u, one college', [demo], undefined, demo],
    ['no u, several colleges', [demo, other], undefined, null],
    ['u repeated, one college', [demo], ['demo', 'other'], demo],
    ['u repeated, several colleges', [demo, other], ['other', 'demo'], null],
    ['empty list', [], 'demo', null],
    ['empty list, no u', [], undefined, null],
  ];

  it.each(cases)('%s', (_case, options, u, expected) => {
    expect(pickCollege(options, u)).toBe(expected);
  });
});
