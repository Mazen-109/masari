/**
 * Next.js start-up hook (contracts/http-and-env.md §3). Runs the checks only in the Node.js server runtime
 * and never during `next build`: Next.js 16 can also call register() in the build workers that prerender
 * pages, where no environment is configured. The dynamic import keeps the database driver out of the edge
 * bundle. Only the two framework variables are read here.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { runStartupChecks } = await import('./server/startup');
    await runStartupChecks();
  }
}
