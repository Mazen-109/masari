import { describe, expect, it } from 'vitest';
import { changedProfileFields, isDivisionSelectable, isLevelAllowed, levelOptions } from './rules';

const DIVISION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

describe('isLevelAllowed', () => {
  it.each([
    [1, 4, true],
    [4, 4, true],
    [5, 4, false],
    [0, 4, false],
    [-1, 4, false],
    [2.5, 4, false],
    [Number.NaN, 4, false],
    [7, 7, true],
    [8, 7, false],
    [7, 9, true],
    [8, 9, false],
    [1, 0, false],
  ])('level %s with %s levels → %s', (level, levelsCount, expected) => {
    expect(isLevelAllowed(level, levelsCount)).toBe(expected);
  });
});

describe('levelOptions', () => {
  it('lists 1…levelsCount', () => {
    expect(levelOptions(4)).toEqual([1, 2, 3, 4]);
    expect(levelOptions(1)).toEqual([1]);
    expect(levelOptions(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('never goes above 7 or below none', () => {
    expect(levelOptions(9)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(levelOptions(0)).toEqual([]);
    expect(levelOptions(-3)).toEqual([]);
    expect(levelOptions(Number.NaN)).toEqual([]);
  });
});

describe('isDivisionSelectable', () => {
  it('offers an active division', () => {
    expect(isDivisionSelectable({ id: DIVISION_ID, isActive: true }, null)).toBe(true);
    expect(isDivisionSelectable({ id: DIVISION_ID, isActive: true }, OTHER_ID)).toBe(true);
  });

  it('refuses an inactive division while creating the profile', () => {
    expect(isDivisionSelectable({ id: DIVISION_ID, isActive: false }, null)).toBe(false);
  });

  it("keeps the student's current division even when it was deactivated", () => {
    expect(isDivisionSelectable({ id: DIVISION_ID, isActive: false }, DIVISION_ID)).toBe(true);
    expect(isDivisionSelectable({ id: DIVISION_ID, isActive: false }, OTHER_ID)).toBe(false);
  });
});

describe('changedProfileFields', () => {
  const current = { level: 2, divisionId: DIVISION_ID };

  it('is empty when nothing changed', () => {
    expect(changedProfileFields(current, { ...current })).toEqual({});
  });

  it('keeps only the changed fields, level before division', () => {
    expect(changedProfileFields(current, { level: 3, divisionId: DIVISION_ID })).toEqual({
      level: 3,
    });
    expect(changedProfileFields(current, { level: 2, divisionId: OTHER_ID })).toEqual({
      divisionId: OTHER_ID,
    });
    expect(Object.keys(changedProfileFields(current, { level: 1, divisionId: OTHER_ID }))).toEqual([
      'level',
      'divisionId',
    ]);
  });
});
