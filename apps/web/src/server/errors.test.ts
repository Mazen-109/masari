import { describe, expect, it } from 'vitest';
import { errorName, sqlStateOf } from './errors';

describe('errorName', () => {
  it('is the class name of an Error', () => {
    expect(errorName(new TypeError('x'))).toBe('TypeError');
    expect(errorName(Object.assign(new Error('x'), { name: 'StudentProfileQueryError' }))).toBe(
      'StudentProfileQueryError',
    );
  });

  it('is unknown for anything else, never the value itself', () => {
    expect(errorName('student@example.com')).toBe('unknown');
    expect(errorName({ name: 'NotAnError' })).toBe('unknown');
    expect(errorName(null)).toBe('unknown');
    expect(errorName(undefined)).toBe('unknown');
  });
});

describe('sqlStateOf', () => {
  it("returns the error's own SQLSTATE", () => {
    expect(sqlStateOf(Object.assign(new Error('x'), { code: '23505' }))).toBe('23505');
    expect(sqlStateOf({ code: '40P01' })).toBe('40P01');
  });

  it('follows `cause` up to two links deep', () => {
    const database = Object.assign(new Error('db'), { code: '40001' });
    expect(sqlStateOf(new Error('wrapped', { cause: database }))).toBe('40001');
    expect(
      sqlStateOf(new Error('outer', { cause: new Error('middle', { cause: database }) })),
    ).toBe('40001');
    const deeper = new Error('a', {
      cause: new Error('b', { cause: new Error('c', { cause: database }) }),
    });
    expect(sqlStateOf(deeper)).toBeNull();
  });

  it('prefers the outermost SQLSTATE', () => {
    const inner = { code: '23505' };
    expect(sqlStateOf({ code: '23514', cause: inner })).toBe('23514');
  });

  it('never returns a code that is not a SQLSTATE', () => {
    expect(sqlStateOf(Object.assign(new Error('x'), { code: 'S-2024-001' }))).toBeNull();
    expect(sqlStateOf({ code: 'ECONNREFUSED' })).toBeNull();
    expect(sqlStateOf({ code: '2350' })).toBeNull();
    expect(sqlStateOf({ code: 23505 })).toBeNull();
    expect(sqlStateOf({ code: 'abcde' })).toBeNull();
  });

  it('is null for values without a code', () => {
    expect(sqlStateOf(new Error('x'))).toBeNull();
    expect(sqlStateOf(null)).toBeNull();
    expect(sqlStateOf('23505')).toBeNull();
    expect(sqlStateOf(undefined)).toBeNull();
  });
});
