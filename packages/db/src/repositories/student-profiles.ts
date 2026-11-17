import { eq, sql } from 'drizzle-orm';
import type { StudentProfile } from '../constants';
import { isUuid, type Tx } from '../context';
import { studentProfiles } from '../schema';

/**
 * Student profiles of the college in context (contracts/db-api.md §1.6, data-model.md §3.6). Tenant-scoped:
 * every function runs inside withTenant, and the `tenant_isolation` policy limits it to the current college.
 * `studentCode` is personal data: it is never logged, and errors from here never carry it in a message the
 * caller would log.
 *
 * Conflicts are reported as typed results. Each write runs in a savepoint (a nested Drizzle transaction),
 * so a refused statement is rolled back to the savepoint and the caller's transaction stays usable (e.g. for
 * an audit entry). The constraint that fired decides the reason, which also covers concurrent writers: the
 * loser of a race on the same code waits for the winner and then gets `student_code_taken`.
 */

export type StudentProfileCreateResult =
  | { ok: true; value: StudentProfile }
  | { ok: false; reason: 'student_code_taken' | 'already_exists' | 'invalid_division' };

export type StudentProfileUpdateResult =
  | { ok: true; value: StudentProfile }
  | { ok: false; reason: 'student_code_taken' | 'not_found' | 'invalid_division' };

export interface StudentProfileInput {
  userId: string;
  studentCode: string;
  level: number;
  divisionId: string;
}

export interface StudentProfilePatch {
  studentCode?: string;
  level?: number;
  divisionId?: string;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** Constraint names of data-model.md §3.6 mapped to the reason they stand for. */
const CONFLICTS = {
  student_profiles_pkey: { code: UNIQUE_VIOLATION, reason: 'already_exists' },
  student_profiles_tenant_code_unique: { code: UNIQUE_VIOLATION, reason: 'student_code_taken' },
  student_profiles_division_fk: { code: FOREIGN_KEY_VIOLATION, reason: 'invalid_division' },
} as const;

type ConflictReason = (typeof CONFLICTS)[keyof typeof CONFLICTS]['reason'];

/**
 * The reason for a known constraint violation anywhere in the error's cause chain (Drizzle wraps the pg
 * error in DrizzleQueryError), or null for any other error.
 */
function conflictReason(error: unknown): ConflictReason | null {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ('code' in current && 'constraint' in current) {
      const { code, constraint } = current;
      if (typeof constraint === 'string' && Object.hasOwn(CONFLICTS, constraint)) {
        const conflict = CONFLICTS[constraint as keyof typeof CONFLICTS];
        return conflict.code === code ? conflict.reason : null;
      }
      return null;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return null;
}

/** The profile of this user in the college in context, or null (also for another college's user). */
export async function findByUserId(tx: Tx, userId: string): Promise<StudentProfile | null> {
  const rows = await tx
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Creates the profile in the college in context (tenant_id comes from the column default app_tenant_id()).
 * `already_exists` when the user has a profile (in any college), `student_code_taken` when the code is used
 * in this college, `invalid_division` when the division is not one of this college's.
 */
export async function create(
  tx: Tx,
  input: StudentProfileInput,
): Promise<StudentProfileCreateResult> {
  if (!isUuid(input.divisionId)) return { ok: false, reason: 'invalid_division' };
  try {
    const row = await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(studentProfiles)
        .values({
          userId: input.userId,
          studentCode: input.studentCode,
          level: input.level,
          divisionId: input.divisionId,
        })
        .returning();
      return rows[0];
    });
    if (!row) throw new Error('student_profiles insert returned no row');
    return { ok: true, value: row };
  } catch (error) {
    const reason = conflictReason(error);
    if (reason !== null) return { ok: false, reason };
    throw error;
  }
}

/**
 * Changes the given fields of the user's profile and sets updated_at. `not_found` when the user has no
 * profile in this college; `student_code_taken` / `invalid_division` as for create.
 */
export async function update(
  tx: Tx,
  userId: string,
  patch: StudentProfilePatch,
): Promise<StudentProfileUpdateResult> {
  if (patch.divisionId !== undefined && !isUuid(patch.divisionId)) {
    return { ok: false, reason: 'invalid_division' };
  }
  try {
    const row = await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .update(studentProfiles)
        .set({
          studentCode: patch.studentCode,
          level: patch.level,
          divisionId: patch.divisionId,
          updatedAt: sql`now()`,
        })
        .where(eq(studentProfiles.userId, userId))
        .returning();
      return rows[0];
    });
    return row ? { ok: true, value: row } : { ok: false, reason: 'not_found' };
  } catch (error) {
    const reason = conflictReason(error);
    // The primary key (user_id) is never changed here, so `already_exists` cannot occur.
    if (reason !== null && reason !== 'already_exists') return { ok: false, reason };
    throw error;
  }
}

/** The highest level of any profile in the college in context; 0 when it has no profiles. */
export async function maxLevelInUse(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ max: sql<number>`coalesce(max(${studentProfiles.level}), 0)::int` })
    .from(studentProfiles);
  return rows[0]?.max ?? 0;
}
