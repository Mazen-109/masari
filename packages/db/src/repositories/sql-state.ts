const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The SQLSTATE anywhere in the error's cause chain (Drizzle wraps the pg error in DrizzleQueryError), or
 * undefined. Repositories keep only this code when they replace an error whose message could quote the
 * statement's parameters.
 */
export function sqlState(error: unknown): string | undefined {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ('code' in current && typeof current.code === 'string' && SQLSTATE.test(current.code)) {
      return current.code;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}
