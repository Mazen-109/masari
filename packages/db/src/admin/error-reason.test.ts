import { describe, expect, it } from 'vitest';
import { failureReason, safeFailureReason } from './error-reason';

describe('failureReason', () => {
  it('keeps the first line of the message', () => {
    expect(failureReason(new Error('relation "x" does not exist\nDETAIL: more'))).toBe(
      'relation "x" does not exist',
    );
  });

  it('hides connection strings', () => {
    expect(
      failureReason(new Error('cannot reach postgres://owner:secret@db.example:5432/masari now')),
    ).toBe('cannot reach <url> now');
  });

  it('uses the first inner error of an AggregateError with an empty message', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    const error = Object.assign(new AggregateError([refused, new Error('second')], ''), {
      code: 'ECONNREFUSED',
    });
    expect(failureReason(error)).toBe('connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('falls back to the code when no inner error has a message', () => {
    const error = Object.assign(new AggregateError([new Error('')], ''), { code: 'ECONNREFUSED' });
    expect(failureReason(error)).toBe('ECONNREFUSED');
  });

  it('falls back to the error name, then to a generic reason', () => {
    expect(failureReason(new TypeError(''))).toBe('TypeError');
    expect(failureReason(new Error(''))).toBe('unknown error');
    expect(failureReason('')).toBe('unknown error');
  });

  it('describes non-Error values', () => {
    expect(failureReason('plain failure')).toBe('plain failure');
  });
});

describe('safeFailureReason', () => {
  it('reduces a PostgreSQL server error to its SQLSTATE, never its message', () => {
    const error = Object.assign(
      new Error('invalid input syntax for type uuid: "person@example.test"'),
      {
        severity: 'ERROR',
        code: '22P02',
      },
    );
    expect(safeFailureReason(error)).toBe('database error 22P02');
  });

  it('keeps the value-free reason of other errors', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    expect(safeFailureReason(refused)).toBe('connect ECONNREFUSED 127.0.0.1:5432');
    expect(
      safeFailureReason(Object.assign(new Error('odd'), { severity: 'ERROR', code: 'x' })),
    ).toBe('odd');
    expect(safeFailureReason(new Error('at postgres://owner:secret@db:5432/masari'))).toBe(
      'at <url>',
    );
  });
});
