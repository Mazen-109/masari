import { describe, expect, it } from 'vitest';
import { retryAfterMinutes } from './retry-after';

describe('retryAfterMinutes', () => {
  it.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [599, 10],
    [3600, 60],
  ])('%i seconds → %i minute(s), rounded up', (seconds, minutes) => {
    expect(retryAfterMinutes(seconds)).toBe(minutes);
  });

  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'has no time to show for %s',
    (seconds) => {
      expect(retryAfterMinutes(seconds)).toBeNull();
    },
  );
});
