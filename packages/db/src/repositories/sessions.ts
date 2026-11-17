import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { sessions } from '../schema';

/**
 * Sign-in sessions (contracts/db-api.md §1.6). Global table without RLS. The auth library creates and reads
 * sessions; this repository only revokes them and never selects or returns `sessions.token`.
 */

/** Deletes every session of the user and returns how many were deleted. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const rows = await getDb()
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}
