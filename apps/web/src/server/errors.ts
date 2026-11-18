/**
 * What of an unexpected error may be logged (constitution; contracts/http-and-env.md §4): its class name
 * and, for a database error, its SQLSTATE — never its message, which can carry personal data.
 */

/** The error's class name (`TypeError`, `StudentProfileQueryError`), or `unknown` for a non-Error value. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
/** How many `cause` links are followed (the error itself counts as the first). */
const MAX_DEPTH = 3;

/**
 * The SQLSTATE of a database error (five characters, never personal data), found in the error's own `code`
 * or in that of an error it wraps as `cause`; null when there is none. A `code` that is not shaped like a
 * SQLSTATE is never returned.
 */
export function sqlStateOf(error: unknown): string | null {
  let current = error;
  for (
    let depth = 0;
    depth < MAX_DEPTH && typeof current === 'object' && current !== null;
    depth += 1
  ) {
    if ('code' in current && typeof current.code === 'string' && SQLSTATE.test(current.code)) {
      return current.code;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return null;
}
