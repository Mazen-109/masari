import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAuthLibrary } from './library-logger';

// The shape Better Auth calls (`Logger['log']` in @better-auth/core 1.7): level, message, extra arguments.
const handler: (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  ...args: unknown[]
) => void = logAuthLibrary;

const PERSONAL = 'mona.ali@example.test';

function lines(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => {
    expect(call).toHaveLength(1);
    return JSON.parse(String(call[0])) as Record<string, unknown>;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logAuthLibrary', () => {
  it('logs errors as one constant auth.library line without the message or the arguments', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new Error(`insert into "users" values ($1) params: Mona Ali,${PERSONAL}`);
    handler('error', `Failed to create user ${PERSONAL}`, cause, { email: PERSONAL });

    const [line] = lines(error);
    expect(line).toEqual({
      level: 'error',
      time: expect.any(String) as string,
      event: 'auth.library',
      libraryLevel: 'error',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(PERSONAL);
    expect(JSON.stringify(error.mock.calls)).not.toContain('Failed to create user');
  });

  it.each(['warn', 'info', 'debug'] as const)(
    'logs %s as a warning carrying only the level',
    (level) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const other = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      handler(level, `message about ${PERSONAL}`, PERSONAL);

      expect(lines(warn)).toEqual([
        {
          level: 'warn',
          time: expect.any(String) as string,
          event: 'auth.library',
          libraryLevel: level,
        },
      ]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(PERSONAL);
      expect(other).not.toHaveBeenCalled();
    },
  );
});
