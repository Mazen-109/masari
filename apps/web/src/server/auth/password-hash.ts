import { hashPassword as libraryHashPassword } from 'better-auth/crypto';

/**
 * The one password hash of the application (research.md §7, §8): the auth library's own (scrypt), handed
 * to it as `emailAndPassword.password.hash`, so every hash it stores is made here. Registration also calls
 * it, and throws the result away, on the paths that create no account (the address already has an account
 * or a pending invitation), so every path costs one hash and they cannot be told apart by their timing
 * (FR-005).
 */
export function hashPassword(password: string): Promise<string> {
  return libraryHashPassword(password);
}
