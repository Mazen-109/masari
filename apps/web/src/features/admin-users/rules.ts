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
