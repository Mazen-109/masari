import { ROLES } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { parseForm } from '@/lib/form';
import {
  changeRoleSchema,
  MAX_SEARCH_LENGTH,
  MAX_USERS_PAGE,
  pageCount,
  parseUsersFilter,
  setStatusSchema,
  USERS_PAGE_SIZE,
  usersQueryString,
} from './schemas';

describe('parseUsersFilter', () => {
  it('reads every valid filter, trimming the search term', () => {
    expect(
      parseUsersFilter({ q: '  Mona  ', role: 'faculty', status: 'suspended', page: '3' }),
    ).toEqual({ q: 'Mona', role: 'faculty', status: 'suspended', page: 3 });
  });

  it('defaults to page 1 and no filters', () => {
    expect(parseUsersFilter({})).toEqual({ page: 1 });
  });

  it('ignores unknown parameters', () => {
    expect(parseUsersFilter({ sort: 'name', page: '2' })).toEqual({ page: 2 });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['x'.repeat(MAX_SEARCH_LENGTH + 1), 'too long'],
  ])('treats the search term %j (%s) as absent', (q) => {
    expect(parseUsersFilter({ q })).toEqual({ page: 1 });
  });

  it('keeps a search term of exactly the maximum length, and LIKE characters as typed', () => {
    const longest = 'x'.repeat(MAX_SEARCH_LENGTH);
    expect(parseUsersFilter({ q: ` ${longest} ` }).q).toBe(longest);
    expect(parseUsersFilter({ q: '100%_\\' }).q).toBe('100%_\\');
  });

  it.each(['Admin', 'owner', ' admin', ''])('treats the role %j as absent', (role) => {
    expect(parseUsersFilter({ role })).toEqual({ page: 1 });
  });

  it.each(['Active', 'deleted', ''])('treats the status %j as absent', (status) => {
    expect(parseUsersFilter({ status })).toEqual({ page: 1 });
  });

  it('accepts every role and status', () => {
    for (const role of ['student', 'faculty', 'student_affairs', 'admin'] as const) {
      expect(parseUsersFilter({ role }).role).toBe(role);
    }
    for (const status of ['active', 'suspended'] as const) {
      expect(parseUsersFilter({ status }).status).toBe(status);
    }
  });

  it.each([
    'abc',
    '0',
    '-1',
    '1.5',
    '1e3',
    ' 2',
    '',
    '0x10',
    String(MAX_USERS_PAGE + 1),
    '999999',
    '9'.repeat(400),
  ])('turns the invalid or too large page %j into page 1', (page) => {
    expect(parseUsersFilter({ page })).toEqual({ page: 1 });
  });

  it('accepts pages up to the maximum, with leading zeros', () => {
    expect(parseUsersFilter({ page: String(MAX_USERS_PAGE) }).page).toBe(MAX_USERS_PAGE);
    expect(parseUsersFilter({ page: '007' }).page).toBe(7);
  });

  it('treats a repeated parameter (an array) as absent', () => {
    expect(
      parseUsersFilter({ q: ['a', 'b'], role: ['admin'], status: ['active'], page: ['2'] }),
    ).toEqual({ page: 1 });
  });
});

describe('usersQueryString', () => {
  it('keeps the filters and the page, and leaves out what is absent', () => {
    expect(usersQueryString({ q: 'Mona Ali', role: 'student', status: 'active' }, 2)).toBe(
      '?q=Mona+Ali&role=student&status=active&page=2',
    );
    const arabic = new URLSearchParams(usersQueryString({ q: 'منى علي' }, 1));
    expect(arabic.get('q')).toBe('منى علي');
    expect(usersQueryString({ role: 'admin' }, 1)).toBe('?role=admin');
    expect(usersQueryString({}, 3)).toBe('?page=3');
    expect(usersQueryString({}, 1)).toBe('');
  });

  it('encodes characters that would break the query', () => {
    expect(usersQueryString({ q: 'a&b=c%' }, 1)).toBe('?q=a%26b%3Dc%25');
  });

  it('round-trips through parseUsersFilter', () => {
    const filter = { q: 'x+y #1', role: 'faculty', status: 'suspended', page: 4 } as const;
    const query = new URLSearchParams(usersQueryString(filter, filter.page));
    expect(parseUsersFilter(Object.fromEntries(query))).toEqual(filter);
  });
});

describe('pageCount', () => {
  it('is the number of pages of 20, and at least 1', () => {
    expect(USERS_PAGE_SIZE).toBe(20);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
    expect(pageCount(5, 2)).toBe(3);
  });
});

const USER_ID = 'usr1'.repeat(6);

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

/** The field errors of a refused form, or null when it was accepted. */
function fieldErrors(result: ReturnType<typeof parseForm>) {
  if (result.ok) return null;
  return result.failure.ok ? null : (result.failure.fieldErrors ?? null);
}

describe('changeRoleSchema', () => {
  it.each(ROLES)('accepts the role %s, trimming both fields and dropping unknown ones', (role) => {
    const result = parseForm(
      changeRoleSchema,
      form({ userId: ` ${USER_ID} `, role: ` ${role} `, tenantId: 'other', status: 'suspended' }),
    );
    expect(result).toEqual({ ok: true, data: { userId: USER_ID, role } });
  });

  it.each([
    { role: 'owner', reason: 'an unknown role' },
    { role: 'Admin', reason: 'another case' },
    { role: '', reason: 'an empty role' },
    { role: undefined, reason: 'a missing role' },
  ])('refuses $reason with invalid_choice', ({ role }) => {
    expect(fieldErrors(parseForm(changeRoleSchema, form({ userId: USER_ID, role })))).toEqual({
      role: 'invalid_choice',
    });
  });

  it.each([
    [undefined, 'required'],
    ['   ', 'required'],
    ['x'.repeat(65), 'too_long'],
  ])('refuses the user id %j with %s', (userId, code) => {
    expect(fieldErrors(parseForm(changeRoleSchema, form({ userId, role: 'faculty' })))).toEqual({
      userId: code,
    });
  });
});

describe('setStatusSchema', () => {
  it.each(['active', 'suspended'])('accepts the status %s', (status) => {
    expect(parseForm(setStatusSchema, form({ userId: USER_ID, status: ` ${status} ` }))).toEqual({
      ok: true,
      data: { userId: USER_ID, status },
    });
  });

  it.each([['deleted'], ['ACTIVE'], [''], [undefined]])(
    'refuses the status %j with invalid_choice',
    (status) => {
      expect(fieldErrors(parseForm(setStatusSchema, form({ userId: USER_ID, status })))).toEqual({
        status: 'invalid_choice',
      });
    },
  );

  it('refuses a missing or too long user id', () => {
    expect(fieldErrors(parseForm(setStatusSchema, form({ status: 'active' })))).toEqual({
      userId: 'required',
    });
    expect(
      fieldErrors(parseForm(setStatusSchema, form({ userId: 'x'.repeat(65), status: 'active' }))),
    ).toEqual({ userId: 'too_long' });
  });
});
