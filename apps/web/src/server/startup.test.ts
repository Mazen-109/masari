import { UnsafeRuntimeRoleError } from '@masari/db';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { EnvError } from './env';
import { runStartupChecks, startupFailureReason } from './startup';

const mocks = vi.hoisted(() => ({
  assertSafeRuntimeRole: vi.fn<() => Promise<void>>(),
  getEnv: vi.fn(),
}));

vi.mock('@masari/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@masari/db')>()),
  assertSafeRuntimeRole: mocks.assertSafeRuntimeRole,
}));

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  getEnv: mocks.getEnv,
}));

let stderr: MockInstance<typeof console.error>;

beforeEach(() => {
  mocks.getEnv.mockReturnValue({});
  mocks.assertSafeRuntimeRole.mockResolvedValue(undefined);
  stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.getEnv.mockReset();
  mocks.assertSafeRuntimeRole.mockReset();
});

function loggedLines(): unknown[] {
  return stderr.mock.calls.map(([text]) => JSON.parse(String(text)) as unknown);
}

describe('runStartupChecks', () => {
  it('validates the environment, then the database role, and does not exit when both pass', async () => {
    const exit = vi.fn();
    await runStartupChecks(exit);
    expect(mocks.getEnv).toHaveBeenCalledOnce();
    expect(mocks.assertSafeRuntimeRole).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('exits 1 naming the invalid variable, without checking the database', async () => {
    mocks.getEnv.mockImplementation(() => {
      throw new EnvError(['BETTER_AUTH_SECRET']);
    });
    const exit = vi.fn();
    await runStartupChecks(exit);
    expect(exit).toHaveBeenCalledWith(1);
    expect(mocks.assertSafeRuntimeRole).not.toHaveBeenCalled();
    expect(loggedLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'startup.failed',
        reason: 'Invalid environment variables: BETTER_AUTH_SECRET',
      }),
    ]);
  });

  it('exits 1 with the RLS-bypass message when the runtime role is unsafe', async () => {
    const message =
      'Unsafe database role for the application (SUPERUSER); DATABASE_URL must name the runtime role';
    mocks.assertSafeRuntimeRole.mockRejectedValue(new UnsafeRuntimeRoleError(message));
    const exit = vi.fn();
    await runStartupChecks(exit);
    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedLines()).toEqual([
      expect.objectContaining({
        event: 'startup.failed',
        reason: `The runtime database role can bypass row-level security. ${message}`,
      }),
    ]);
  });

  it('exits the process by default', async () => {
    mocks.getEnv.mockImplementation(() => {
      throw new EnvError(['APP_URL']);
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await runStartupChecks();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('startupFailureReason', () => {
  it('keeps the message of our own errors', () => {
    expect(startupFailureReason(new EnvError(['APP_ENV', 'APP_URL']))).toBe(
      'Invalid environment variables: APP_ENV, APP_URL',
    );
  });

  it('reduces a driver error to its code, dropping a message that could name hosts or users', () => {
    const error = Object.assign(new Error('password authentication failed for user "someone"'), {
      code: '28P01',
    });
    const reason = startupFailureReason(error);
    expect(reason).toBe('Database check failed (28P01)');
    expect(reason).not.toContain('someone');
  });

  it('finds the code inside an AggregateError (connection refused on every address)', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    expect(startupFailureReason(new AggregateError([new Error('no code'), inner], ''))).toBe(
      'Database check failed (ECONNREFUSED)',
    );
  });

  it.each([new Error('no code here'), 'a string', null, new AggregateError([], '')])(
    'falls back to "unknown error" for %j',
    (error) => {
      expect(startupFailureReason(error)).toBe('Database check failed (unknown error)');
    },
  );
});
