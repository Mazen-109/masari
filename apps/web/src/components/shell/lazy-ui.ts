/**
 * Calls `load` once the page has finished loading and the browser is idle (PR-40). Menus and drawers that
 * are not part of the first paint use it to fetch their code ahead of first use without competing with
 * the page's own scripts, fonts, and styles. Returns the cleanup for `useEffect`.
 */
export function preloadWhenIdle(load: () => unknown): () => void {
  let cancelled = false;
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (!cancelled) load();
  };
  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      timer = setTimeout(run, 200);
    }
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}
