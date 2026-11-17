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
