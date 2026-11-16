/**
 * One-line reason for an operator script failure (contracts/cli.md §2): never a connection string. Some
 * errors have an empty message — Node's AggregateError from a refused connection to every address of
 * `localhost` is the common one — so fall back to the first inner error, then the error code, then the name.
 */

const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').trim();
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' && error.code !== '' ? error.code : undefined;
}

function describe(error: unknown, depth: number): string | undefined {
  if (!(error instanceof Error)) return firstLine(String(error)) || undefined;
  const message = firstLine(error.message);
  if (message) return message;
  if (error instanceof AggregateError && depth < 3) {
    const inner = (error.errors as unknown[])
      .map((item) => describe(item, depth + 1))
      .find((text) => text !== undefined);
    if (inner) return inner;
  }
  return codeOf(error) ?? (error.name !== 'Error' ? error.name : undefined);
}

export function failureReason(error: unknown): string {
  return (describe(error, 0) ?? 'unknown error').replace(URL_PATTERN, '<url>');
}
