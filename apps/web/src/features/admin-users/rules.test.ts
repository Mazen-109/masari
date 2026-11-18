import { describe, expect, it } from 'vitest';
import { canActOnUser, changedStudentFields } from './rules';

const ADMIN = 'admn'.repeat(4);
const OTHER = 'othr'.repeat(4);

describe('canActOnUser', () => {
  it('allows acting on another account', () => {
    expect(canActOnUser(ADMIN, OTHER)).toBe(true);
  });

  it('refuses acting on the own account', () => {
    expect(canActOnUser(ADMIN, ADMIN)).toBe(false);
  });

  it.each([
    ['', OTHER],
    [ADMIN, ''],
    ['', ''],
  ])('refuses a missing id (%j, %j)', (actor, target) => {
    expect(canActOnUser(actor, target)).toBe(false);
  });
});

describe('changedStudentFields', () => {
  const current = { studentCode: 'CS-001', level: 2, divisionId: 'division-a' };

  it('is empty when nothing differs', () => {
    expect(changedStudentFields(current, { ...current })).toEqual({});
  });

  it('keeps only the changed fields, in the order code, level, division', () => {
    expect(Object.keys(changedStudentFields(current, { ...current, level: 3 }))).toEqual(['level']);
    const all = changedStudentFields(current, {
      divisionId: 'division-b',
      level: 4,
      studentCode: 'CS-002',
    });
    expect(all).toEqual({ studentCode: 'CS-002', level: 4, divisionId: 'division-b' });
    expect(Object.keys(all)).toEqual(['studentCode', 'level', 'divisionId']);
  });

  it('treats a change of letter case in the code as a change', () => {
    expect(changedStudentFields(current, { ...current, studentCode: 'cs-001' })).toEqual({
      studentCode: 'cs-001',
    });
  });
});
