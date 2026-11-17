import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './log';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function spies() {
  return {
    info: vi.spyOn(console, 'log').mockImplementation(() => undefined),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  };
}

/** The single line written through the spy, parsed. */
function onlyLine(spy: { mock: { calls: unknown[][] } }): unknown {
  expect(spy.mock.calls).toHaveLength(1);
  const [text] = spy.mock.calls[0] ?? [];
  expect(typeof text).toBe('string');
  expect(text).not.toContain('\n');
  return JSON.parse(text as string);
}

describe('log', () => {
  it.each(['info', 'warn', 'error'] as const)(
    '%s writes one JSON line with level, ISO time, event, and the fields',
    (level) => {
      vi.useFakeTimers({ now: new Date('2026-11-17T08:00:00.000Z') });
      const all = spies();
      log[level]('test.event', { userId: 'u1', count: 2, ok: true, code: null });
      expect(onlyLine(all[level])).toEqual({
        level,
        time: '2026-11-17T08:00:00.000Z',
        event: 'test.event',
        userId: 'u1',
        count: 2,
        ok: true,
        code: null,
      });
      for (const other of (['info', 'warn', 'error'] as const).filter((name) => name !== level)) {
        expect(all[other]).not.toHaveBeenCalled();
      }
    },
  );

  it('puts level, time, and event first', () => {
    const all = spies();
    log.info('ordered', { a: 1 });
    expect(Object.keys(onlyLine(all.info) as object)).toEqual(['level', 'time', 'event', 'a']);
  });

  it('works without fields', () => {
    const all = spies();
    log.warn('no.fields');
    expect(onlyLine(all.warn)).toEqual({
      level: 'warn',
      time: expect.any(String) as unknown,
      event: 'no.fields',
    });
  });

  it('does not let a field overwrite level, time, or event', () => {
    const all = spies();
    log.error('real.event', { level: 'info', time: 'never', event: 'fake', id: 'x' });
    expect(onlyLine(all.error)).toEqual({
      level: 'error',
      time: expect.not.stringMatching(/^never$/) as unknown,
      event: 'real.event',
      id: 'x',
    });
  });

  it('escapes line breaks inside values, keeping one line per entry', () => {
    const all = spies();
    log.info('multi', { reason: 'first\nsecond' });
    expect(onlyLine(all.info)).toMatchObject({ reason: 'first\nsecond' });
  });
});
