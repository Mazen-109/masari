import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword } from './password-hash';

// research.md §8 (FR-005): the application's password hash is the auth library's own, so a hash made here
// is verified by the library's default verify, and the same password never gives the same hash twice.

describe('hashPassword', () => {
  it('makes a salted hash the library verifies', async () => {
    const password = 'Ab1'.repeat(4);
    const [first, second] = [await hashPassword(password), await hashPassword(password)];
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword({ hash: first, password })).toBe(true);
    expect(await verifyPassword({ hash: first, password: 'Xy9'.repeat(4) })).toBe(false);
  });
});
