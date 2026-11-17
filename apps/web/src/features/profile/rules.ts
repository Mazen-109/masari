import { MAX_LEVEL } from './schemas';

/** Pure rules of the academic profile (FR-025, FR-026). */

/** True for a whole level from 1 up to the college's number of levels (never above 7). */
export function isLevelAllowed(level: number, levelsCount: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= Math.min(levelsCount, MAX_LEVEL);
}

/** The levels a student of the college may choose, 1…levelsCount (at most 7). */
export function levelOptions(levelsCount: number): number[] {
  const count = Number.isFinite(levelsCount)
    ? Math.max(0, Math.min(Math.trunc(levelsCount), MAX_LEVEL))
    : 0;
  return Array.from({ length: count }, (_, index) => index + 1);
}

/**
 * True when a student may pick the division: an active one, or the one the student already has even if it
 * was deactivated since (so an edit does not force a change). `currentDivisionId` is null while the
 * profile is being created.
 */
export function isDivisionSelectable(
  division: Readonly<{ id: string; isActive: boolean }>,
  currentDivisionId: string | null,
): boolean {
  return division.isActive || (currentDivisionId !== null && division.id === currentDivisionId);
}

/** The editable academic fields of a profile (the student code is not one of them, FR-025). */
export type EditableProfileFields = Readonly<{ level: number; divisionId: string }>;

/**
 * Only the fields whose value differs from the current profile, in a fixed order (level, divisionId):
 * the patch to write and, by its keys, the `fields` of the `profile.updated` audit row.
 */
export function changedProfileFields(
  current: EditableProfileFields,
  next: EditableProfileFields,
): Partial<EditableProfileFields> {
  const patch: { level?: number; divisionId?: string } = {};
  if (next.level !== current.level) patch.level = next.level;
  if (next.divisionId !== current.divisionId) patch.divisionId = next.divisionId;
  return patch;
}
