import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

const runStartupChecks = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('./server/startup', () => ({ runStartupChecks }));

afterEach(() => {
  vi.unstubAllEnvs();
  runStartupChecks.mockReset();
});

describe('register', () => {
  it('runs the start-up checks in the Node.js server runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', 'phase-production-server');
    await register();
    expect(runStartupChecks).toHaveBeenCalledOnce();
  });

  it('runs them when NEXT_PHASE is not set (next dev / next start)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', undefined);
    await register();
    expect(runStartupChecks).toHaveBeenCalledOnce();
  });

  it('does nothing during next build', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    await register();
    expect(runStartupChecks).not.toHaveBeenCalled();
  });

  it.each(['edge', undefined])('does nothing when NEXT_RUNTIME is %s', async (runtime) => {
    vi.stubEnv('NEXT_RUNTIME', runtime);
    vi.stubEnv('NEXT_PHASE', undefined);
    await register();
    expect(runStartupChecks).not.toHaveBeenCalled();
  });
});
