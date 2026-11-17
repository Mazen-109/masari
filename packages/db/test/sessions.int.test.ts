import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sessions } from '../src';
import { closeTestPools, makeTenant, makeUser, ownerQuery } from './helpers';

// contracts/db-api.md §1.6 `sessions` and §4 (tasks.md T058): revokeAllForUser deletes only that user's
// sessions; revokeByToken deletes exactly the session with that token. Run as the runtime role.

afterAll(closeTestPools);

/** Inserts a session through the owner connection; the token is random hex, never a fixed literal. */
async function makeSession(userId: string): Promise<string> {
  return (await makeSessionWithToken(userId)).id;
}

async function makeSessionWithToken(userId: string): Promise<{ id: string; token: string }> {
  const id = `s_${randomBytes(9).toString('hex')}`;
  const token = randomBytes(16).toString('hex');
  await ownerQuery(
    `INSERT INTO sessions (id, expires_at, token, user_id)
     VALUES ($1, now() + interval '1 day', $2, $3)`,
    [id, token, userId],
  );
  return { id, token };
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

describe('sessions.revokeByToken', () => {
  it('deletes only the session with that token', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const other = await makeUser(tenant.id);
    const target = await makeSessionWithToken(user.id);
    const keepSameUser = await makeSession(user.id);
    const keepOther = await makeSession(other.id);

    expect(await sessions.revokeByToken(target.token)).toBe(1);

    expect(await sessionIdsOf(user.id)).toEqual([keepSameUser]);
    expect(await sessionIdsOf(other.id)).toEqual([keepOther]);
    expect(await sessions.revokeByToken(target.token)).toBe(0);
  });

  it('returns 0 for an empty or unknown token', async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const keep = await makeSession(user.id);

    expect(await sessions.revokeByToken('')).toBe(0);
    expect(await sessions.revokeByToken(randomBytes(16).toString('hex'))).toBe(0);
    expect(await sessionIdsOf(user.id)).toEqual([keep]);
  });
});
