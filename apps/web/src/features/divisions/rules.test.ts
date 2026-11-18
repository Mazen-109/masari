import { describe, expect, it } from 'vitest';
import { changedDivisionFields, DIVISION_FIELDS } from './rules';

// FR-033: an edit writes, and audits, only the names and order that actually changed.

const before = { nameAr: 'علوم الحاسب', nameEn: 'Computer Science', sortOrder: 1 };

describe('changedDivisionFields', () => {
  it('is empty when nothing differs', () => {
    expect(changedDivisionFields(before, { ...before })).toEqual({});
  });

  it('returns only the changed fields with their new values, in display order', () => {
    const patch = changedDivisionFields(before, { ...before, sortOrder: 0, nameAr: 'الحاسب' });
    expect(patch).toEqual({ nameAr: 'الحاسب', sortOrder: 0 });
    expect(Object.keys(patch)).toEqual(['nameAr', 'sortOrder']);
  });

  it('lists every editable field when all of them change', () => {
    const after = { nameAr: 'حاسب', nameEn: 'Computing', sortOrder: 9 };
    expect(Object.keys(changedDivisionFields(before, after))).toEqual([...DIVISION_FIELDS]);
  });
});
