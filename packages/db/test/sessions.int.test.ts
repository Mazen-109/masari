import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sessions } from '../src';
import { closeTestPools, makeTenant, makeUser, ownerQuery } from './helpers';

// contracts/db-api.md §1.6 `sessions` and §4 (tasks.md T058): revokeAllForUser deletes only that user's
// sessions. Run as the runtime role.

afterAll(closeTestPools);

/** Inserts a session through the owner connection; the token is random hex, never a fixed literal. */
async function makeSession(userId: string): Promise<string> {
  const id = `s_${randomBytes(9).toString('hex')}`;
  await ownerQuery(
    `INSERT INTO sessions (id, expires_at, token, user_id)
     VALUES ($1, now() + interval '1 day', $2, $3)`,
    [id, randomBytes(16).toString('hex'), userId],
  );
  return id;
}

async function sessionIdsOf(userId: string): Promise<string[]> {
  const result = await ownerQuery<{ id: string }>(
    'SELECT id FROM sessions WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return result.rows.map((row) => row.id);
}

describe('sessions.revokeAllForUser', () => {
  it("deletes every session of the user and only that user's sessions", async () => {
    const tenant = await makeTenant();
    const other = await makeTenant();
    const target = await makeUser(tenant.id);
    const sameCollege = await makeUser(tenant.id);
    const otherCollege = await makeUser(other.id);
    await makeSession(target.id);
    await makeSession(target.id);
    await makeSession(target.id);
    const keepSame = await makeSession(sameCollege.id);
    const keepOther = await makeSession(otherCollege.id);

    expect(await sessions.revokeAllForUser(target.id)).toBe(3);

    expect(await sessionIdsOf(target.id)).toEqual([]);
    expect(await sessionIdsOf(sameCollege.id)).toEqual([keepSame]);
    expect(await sessionIdsOf(otherCollege.id)).toEqual([keepOther]);
    // The account itself is untouched.
    expect((await ownerQuery('SELECT 1 FROM users WHERE id = $1', [target.id])).rowCount).toBe(1);
  });

  it('returns 0 for a user without sessions and for an unknown user', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const keep = await makeSession(user.id);

    expect(await sessions.revokeAllForUser(`u_${randomBytes(9).toString('hex')}`)).toBe(0);
    expect(await sessions.revokeAllForUser('')).toBe(0);
    expect(await sessionIdsOf(user.id)).toEqual([keep]);

    expect(await sessions.revokeAllForUser(user.id)).toBe(1);
    expect(await sessions.revokeAllForUser(user.id)).toBe(0);
  });
});
