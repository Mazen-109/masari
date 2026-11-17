import { unstable_rethrow } from 'next/navigation';

/**
 * Runs the sign-out action for the user menu. Next.js control-flow errors — above all the redirect to the
 * sign-in screen that ends a successful sign-out — are rethrown with `unstable_rethrow` so the router can
 * handle them. Any other failure (e.g. the network is down) is swallowed: the user is still signed in, and
 * the menu item simply becomes usable again; there is nothing else to show.
 */
export async function runSignOut(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    unstable_rethrow(error);
  }
}
