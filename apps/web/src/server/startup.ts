import { assertSafeRuntimeRole, UnsafeRuntimeRoleError } from '@masari/db';
import { EnvError, getEnv } from './env';
import { log } from './log';

/**
 * Start-up checks run once by `instrumentation.ts` in the Node.js server runtime (contracts/http-and-env.md
 * §3, FR-045, constitution III): the environment is valid and the runtime database role cannot bypass
 * row-level security. On failure one `startup.failed` line is logged and the process exits non-zero.
 */

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string' && error.code !== '') return error.code;
  // A refused connection to every address of a host name arrives as an AggregateError.
  if (error instanceof AggregateError) {
    for (const inner of error.errors as unknown[]) {
      const code = errorCode(inner);
      if (code) return code;
    }
  }
  return undefined;
}

/**
 * Reason printed in the log line. Our own errors carry safe messages (variable names; role attributes);
 * anything else — typically a driver error, whose message can contain host or user names — is reduced to
 * its error code.
 */
export function startupFailureReason(error: unknown): string {
  if (error instanceof EnvError) return error.message;
  if (error instanceof UnsafeRuntimeRoleError) {
    return `The runtime database role can bypass row-level security. ${error.message}`;
  }
  return `Database check failed (${errorCode(error) ?? 'unknown error'})`;
}

export async function runStartupChecks(
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> {
  try {
    getEnv();
    await assertSafeRuntimeRole();
  } catch (error) {
    log.error('startup.failed', { reason: startupFailureReason(error) });
    exit(1);
  }
}
