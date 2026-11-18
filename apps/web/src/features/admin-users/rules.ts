/**
 * Business rules of the People screen's row actions (contracts/server-actions.md §5.3; FR-030, FR-031).
 */

/**
 * Whether an administrator may change the role or the status of the account `targetId`: never their own
 * (an administrator cannot demote or suspend themselves), and never without both ids.
 */
export function canActOnUser(actorId: string, targetId: string): boolean {
  return actorId !== '' && targetId !== '' && actorId !== targetId;
}

/** The academic fields an administrator corrects (FR-028): the student code too, unlike the student. */
export type StudentProfileFields = Readonly<{
  studentCode: string;
  level: number;
  divisionId: string;
}>;

/**
 * Only the fields whose value differs from the current profile, in a fixed order (studentCode, level,
 * divisionId): the patch to write and, by its keys, the `fields` of the `profile.updated` audit row. The
 * student code is compared exactly: changing only its letter case is a correction too.
 */
export function changedStudentFields(
  current: StudentProfileFields,
  next: StudentProfileFields,
): Partial<StudentProfileFields> {
  const patch: { studentCode?: string; level?: number; divisionId?: string } = {};
  if (next.studentCode !== current.studentCode) patch.studentCode = next.studentCode;
  if (next.level !== current.level) patch.level = next.level;
  if (next.divisionId !== current.divisionId) patch.divisionId = next.divisionId;
  return patch;
}
