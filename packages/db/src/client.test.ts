import { afterEach, describe, expect, it, vi } from 'vitest';
import { closePool, getPool, logPoolError } from './client';

afterEach(async () => {
  vi.restoreAllMocks();
  await closePool();
});

function captureStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

describe('pool error listener', () => {
  it('logs an idle-client error as one JSON line with the code only', () => {
    const write = captureStderr();
    const error = Object.assign(new Error('password authentication failed for user "someone"'), {
      code: '57P01',
    });
    logPoolError(error);
    expect(write).toHaveBeenCalledTimes(1);
    const output = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({
      level: 'error',
      event: 'db.pool_error',
      code: '57P01',
    });
    expect(output).not.toContain('someone');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('logs a null code for errors without one', () => {
    const write = captureStderr();
    logPoolError(new Error('boom'));
    logPoolError('not an error');
    for (const [chunk] of write.mock.calls) {
      expect(JSON.parse(String(chunk))).toMatchObject({ code: null });
    }
  });

  it('is attached to the pool, so an emitted error does not crash the process', () => {
    const write = captureStderr();
    const pool = getPool();
    expect(pool.listenerCount('error')).toBe(1);
    expect(() => pool.emit('error', new Error('connection terminated'))).not.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
