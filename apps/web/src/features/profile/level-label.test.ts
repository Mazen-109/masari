import { describe, expect, it } from 'vitest';
import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import { levelLabelKey } from './level-label';

describe('levelLabelKey', () => {
  it('names every level 1–7 with an existing common key in both languages', () => {
    for (let level = 1; level <= 7; level++) {
      const key = levelLabelKey(level);
      expect(key).toBe(`levels.${String(level)}`);
      const [, number] = key.split('.') as [string, keyof typeof ar.common.levels];
      expect(ar.common.levels[number]).toBeTruthy();
      expect(en.common.levels[number]).toBeTruthy();
    }
    expect(ar.common.levels['1']).toBe('الفرقة الأولى');
  });

  it.each([[0], [8], [-1], [1.5], [Number.NaN]])('throws for %s', (level) => {
    expect(() => levelLabelKey(level)).toThrow(RangeError);
  });
});
