import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadWhenIdle } from './lazy-ui';

// A minimal browser for the node test environment: `load` listeners, an idle queue, the ready state.
function fakeBrowser(readyState: DocumentReadyState, withIdleCallback = true) {
  const loadListeners = new Set<() => void>();
  const idleQueue = new Map<number, () => void>();
  let nextIdle = 1;
  const window = {
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'load') loadListeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'load') loadListeners.delete(listener);
    },
    requestIdleCallback: withIdleCallback
      ? (callback: () => void) => {
          idleQueue.set(nextIdle, callback);
          return nextIdle++;
        }
      : undefined,
    cancelIdleCallback: (id: number) => idleQueue.delete(id),
  };
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { readyState });
  return {
    fireLoad: () => [...loadListeners].forEach((listener) => listener()),
    runIdle: () => {
      const callbacks = [...idleQueue.values()];
      idleQueue.clear();
      callbacks.forEach((callback) => callback());
    },
    pendingIdle: () => idleQueue.size,
  };
}

describe('preloadWhenIdle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the load event and then for an idle moment', () => {
    const browser = fakeBrowser('interactive');
    const load = vi.fn();
    preloadWhenIdle(load);

    expect(browser.pendingIdle()).toBe(0);
    browser.fireLoad();
    expect(load).not.toHaveBeenCalled();
    browser.runIdle();
    expect(load).toHaveBeenCalledOnce();
  });

  it('only waits for an idle moment when the page has already loaded', () => {
    const browser = fakeBrowser('complete');
    const load = vi.fn();
    preloadWhenIdle(load);

    browser.runIdle();
    expect(load).toHaveBeenCalledOnce();
  });

  it('falls back to a short timer without requestIdleCallback', () => {
    fakeBrowser('complete', false);
    const load = vi.fn();
    preloadWhenIdle(load);

    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(load).toHaveBeenCalledOnce();
  });

  it('does nothing after cleanup, before or after the load event', () => {
    const browser = fakeBrowser('interactive');
    const beforeLoad = vi.fn();
    preloadWhenIdle(beforeLoad)();
    browser.fireLoad();
    browser.runIdle();
    expect(beforeLoad).not.toHaveBeenCalled();

    const afterLoad = vi.fn();
    const cleanup = preloadWhenIdle(afterLoad);
    browser.fireLoad();
    cleanup();
    browser.runIdle();
    expect(afterLoad).not.toHaveBeenCalled();
  });
});
