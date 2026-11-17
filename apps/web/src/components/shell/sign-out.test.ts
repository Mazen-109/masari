import { notFound, redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { runSignOut } from './sign-out';

/** The `digest` Next.js puts on its control-flow errors, or undefined. */
function digestOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'digest' in error
    ? error.digest
    : undefined;
}

describe('runSignOut', () => {
  it('runs the action once', async () => {
    const action = vi.fn(() => Promise.resolve());
    await runSignOut(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('rethrows the redirect that ends a successful sign-out, so the router can follow it', async () => {
    const thrown = await runSignOut(() => Promise.resolve(redirect('/ar/sign-in'))).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(digestOf(thrown)).toMatch(/^NEXT_REDIRECT;/);
  });

  it('rethrows other Next.js control-flow errors', async () => {
    const thrown = await runSignOut(() => Promise.resolve(notFound())).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(digestOf(thrown)).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it('swallows any other failure, leaving the user signed in and the item usable again', async () => {
    await expect(runSignOut(() => Promise.reject(new TypeError('Failed to fetch')))).resolves.toBe(
      undefined,
    );
  });
});
