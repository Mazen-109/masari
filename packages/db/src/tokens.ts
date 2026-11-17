import { createHash, randomBytes } from 'node:crypto';

/**
 * Invitation tokens (contracts/db-api.md §1.5, research.md §23): 32 random bytes, base64url (43 characters,
 * no padding). Only the SHA-256 hex of a token is stored, so a leaked database does not leak usable links.
 * Neither the token nor its hash is ever logged.
 */

const TOKEN_BYTES = 32;

/** SHA-256 hex (64 lower-case hex characters) of the token's UTF-8 bytes. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new random token and its hash; the token goes into the invitation link, the hash into the database. */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}
