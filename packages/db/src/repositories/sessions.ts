import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { sessions } from '../schema';

/**
 * Sign-in sessions (contracts/db-api.md §1.6). Global table without RLS. The auth library creates and reads
 * sessions; this repository only revokes them and never selects or returns `sessions.token`.
 */

/**
 * Deletes the one session with this token (the value the auth library returned when it created it) and
 * returns how many were deleted (0 or 1; 0 for an empty token). Only the sign-in action's fallback uses
 * it, when the library cannot end the session it just created.
 */
export async function revokeByToken(token: string): Promise<number> {
  if (token === '') return 0;
  const rows = await getDb()
    .delete(sessions)
    .where(eq(sessions.token, token))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Deletes every session of the user and returns how many were deleted. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const rows = await getDb()
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}
