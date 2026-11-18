import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/client';
import type { Invitation, Role } from '../src/constants';
import { withInvitationToken, withTenant, type Tx } from '../src/context';
import * as divisions from '../src/repositories/divisions';
import * as invitations from '../src/repositories/invitations';
import { hashInvitationToken } from '../src/tokens';
import {
  closeTestPools,
  makeTenant,
  makeUser,
  ownerTenantQuery,
  pgErrorCode,
  runtimeQuery,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §4: one pending per email; expired pending replaced; token lookup works only with the
// matching hash and returns nothing for other tokens; concurrent claim → exactly one succeeds; release;
// revoke states; cross-college invisibility. Everything runs as the runtime role (withTenant /
// withInvitationToken); fixtures are arranged through the owner connection.

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const DAY_MS = 24 * 60 * 60 * 1000;

let collegeA: TenantFixture;
let collegeB: TenantFixture;

beforeEach(async () => {
  collegeA = await makeTenant();
  collegeB = await makeTenant();
});

afterAll(closeTestPools);

function inCollege<T>(college: TenantFixture, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: college.id, userId: null }, fn);
}

let emailCounter = 0;
function freshEmail(): string {
  emailCounter += 1;
  return `invitee-${Date.now()}-${emailCounter}@example.test`;
}

async function invite(
  college: TenantFixture,
  input: { email?: string; role?: Role; invitedBy?: string | null } = {},
): Promise<{ value: Invitation; token: string }> {
  const result = await inCollege(college, (tx) =>
    invitations.create(tx, {
      email: input.email ?? freshEmail(),
      role: input.role ?? 'faculty',
      invitedBy: input.invitedBy ?? null,
    }),
  );
  if (!result.ok) throw new Error(`invite: ${result.reason}`);
  return { value: result.value, token: result.token };
}

/** Moves the invitation's expiry into the past (owner fixture). */
async function expire(invitation: Invitation): Promise<void> {
  const result = await ownerTenantQuery(
    invitation.tenantId,
    `UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`,
    [invitation.id],
  );
  expect(result.rowCount).toBe(1);
}

async function storedRow(
  invitation: Invitation,
): Promise<{ token_hash: string; status: string; accepted_user_id: string | null } | undefined> {
  const result = await ownerTenantQuery<{
    token_hash: string;
    status: string;
    accepted_user_id: string | null;
  }>(
    invitation.tenantId,
    'SELECT token_hash, status, accepted_user_id FROM invitations WHERE id = $1',
    [invitation.id],
  );
  return result.rows[0];
}

function lookup(token: string): Promise<Invitation | null> {
  const tokenHash = hashInvitationToken(token);
  return withInvitationToken(tokenHash, (tx) => invitations.findByTokenHash(tx, tokenHash));
}

describe('invitations.create', () => {
  it('creates a pending 7-day invitation and returns the plain token once, storing only its hash', async () => {
    const admin = await makeUser(collegeA.id, { role: 'admin' });
    const before = Date.now();
    const { value, token } = await invite(collegeA, {
      email: '  New.Staff@Example.TEST ',
      role: 'student_affairs',
      invitedBy: admin.id,
    });
    expect(value).toMatchObject({
      tenantId: collegeA.id,
      email: 'new.staff@example.test',
      role: 'student_affairs',
      status: 'pending',
      invitedBy: admin.id,
      acceptedUserId: null,
      acceptedAt: null,
    });
    expect(Object.keys(value)).not.toContain('tokenHash');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const validity = value.expiresAt.getTime() - value.createdAt.getTime();
    expect(Math.abs(validity - 7 * DAY_MS)).toBeLessThan(1000);
    expect(value.expiresAt.getTime()).toBeGreaterThan(before + 7 * DAY_MS - 60_000);

    const stored = await storedRow(value);
    expect(stored?.token_hash).toBe(hashInvitationToken(token));
    expect(stored?.token_hash).not.toBe(token);
  });

  it('refuses a second pending invitation for the same email and keeps the transaction usable', async () => {
    const email = freshEmail();
    const first = await invite(collegeA, { email });
    const outcome = await inCollege(collegeA, async (tx) => {
      const result = await invitations.create(tx, {
        email: email.toUpperCase(),
        role: 'admin',
        invitedBy: null,
      });
      return { result, listed: (await invitations.list(tx)).map((row) => row.id) };
    });
    expect(outcome).toEqual({
      result: { ok: false, reason: 'pending_exists' },
      listed: [first.value.id],
    });
  });

  it('lets exactly one of two concurrent creates for the same email win', async () => {
    const email = freshEmail();
    const results = await Promise.all(
      [0, 1].map(() =>
        inCollege(collegeA, (tx) =>
          invitations.create(tx, { email, role: 'faculty', invitedBy: null }),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: 'pending_exists' },
    ]);
  });

  it('replaces an expired pending invitation for the same email (the old one becomes revoked)', async () => {
    const email = freshEmail();
    const old = await invite(collegeA, { email });
    await expire(old.value);
    const fresh = await invite(collegeA, { email, role: 'admin' });
    expect(fresh.value.id).not.toBe(old.value.id);
    expect((await storedRow(old.value))?.status).toBe('revoked');
    expect(await lookup(old.token)).toMatchObject({ id: old.value.id, status: 'revoked' });
  });

  it('allows a new invitation after the previous one was accepted or revoked', async () => {
    const email = freshEmail();
    const accepted = await invite(collegeA, { email });
    await inCollege(collegeA, (tx) => invitations.claim(tx, accepted.value.id));
    const revoked = await invite(collegeA, { email });
    expect(await inCollege(collegeA, (tx) => invitations.revoke(tx, revoked.value.id))).toBe(
      'revoked',
    );
    await expect(invite(collegeA, { email })).resolves.toBeDefined();
  });

  it('allows the same email to be pending in two colleges', async () => {
    const email = freshEmail();
    const inA = await invite(collegeA, { email });
    const inB = await invite(collegeB, { email });
    expect(inA.value.tenantId).toBe(collegeA.id);
    expect(inB.value.tenantId).toBe(collegeB.id);
  });

  it('enforces the table constraints for the runtime role', async () => {
    const insert = (email: string, role: string) =>
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`INSERT INTO invitations (email, role, token_hash, expires_at)
              VALUES (${email}, ${role}, ${hashInvitationToken(email + role)}, now() + interval '1 day')`,
        ),
      );
    expect(await pgErrorCode(insert('Upper@example.test', 'faculty'))).toBe('23514');
    expect(await pgErrorCode(insert(freshEmail(), 'owner'))).toBe('23514');
    // Without a college in context the policy refuses even an explicit tenant_id (42501 = RLS violation,
    // checked before NOT NULL), also inside withInvitationToken for the very hash being inserted.
    const tokenHash = hashInvitationToken('Cd2'.repeat(14) + 'C');
    expect(
      await pgErrorCode(
        withInvitationToken(tokenHash, (tx) =>
          tx.execute(
            sql`INSERT INTO invitations (tenant_id, email, role, token_hash, expires_at)
                VALUES (${collegeA.id}, ${freshEmail()}, 'faculty', ${tokenHash},
                        now() + interval '1 day')`,
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('refuses an explicit tenant_id of another college (row-level security)', async () => {
    const email = freshEmail();
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`INSERT INTO invitations (tenant_id, email, role, token_hash, expires_at)
              VALUES (${collegeB.id}::uuid, ${email}, 'admin',
                      ${hashInvitationToken(email)}, now() + interval '1 day')`,
        ),
      ),
    );
    expect(code).toBe('42501');
    expect(await inCollege(collegeB, (tx) => invitations.list(tx))).toEqual([]);
  });

  it('refuses moving an invitation to another college (row-level security)', async () => {
    const { value } = await invite(collegeA);
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`UPDATE invitations SET tenant_id = ${collegeB.id}::uuid WHERE id = ${value.id}::uuid`,
        ),
      ),
    );
    expect(code).toBe('42501');
    expect(await inCollege(collegeB, (tx) => invitations.list(tx))).toEqual([]);
    expect((await storedRow(value))?.status).toBe('pending');
  });
});

describe('invitations.list', () => {
  it('lists only the current college, newest first, with the display status and no token hash', async () => {
    const pending = await invite(collegeA);
    const expired = await invite(collegeA);
    await expire(expired.value);
    const revoked = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.revoke(tx, revoked.value.id));
    const accepted = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.claim(tx, accepted.value.id));
    await invite(collegeB);

    const rows = await inCollege(collegeA, (tx) => invitations.list(tx));
    expect(rows.map((row) => [row.id, row.displayStatus])).toEqual([
      [accepted.value.id, 'accepted'],
      [revoked.value.id, 'revoked'],
      [expired.value.id, 'expired'],
      [pending.value.id, 'pending'],
    ]);
    expect(rows.find((row) => row.id === expired.value.id)?.status).toBe('pending');
    for (const row of rows) expect(Object.keys(row)).not.toContain('tokenHash');
  });
});

describe('invitations.hasUsablePending', () => {
  it('is true only for a pending, unexpired invitation of the current college (any letter case)', async () => {
    const usable = await invite(collegeA);
    const expired = await invite(collegeA);
    await expire(expired.value);
    const revoked = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.revoke(tx, revoked.value.id));
    const check = (college: TenantFixture, email: string) =>
      inCollege(college, (tx) => invitations.hasUsablePending(tx, email));

    expect(await check(collegeA, usable.value.email.toUpperCase())).toBe(true);
    expect(await check(collegeA, expired.value.email)).toBe(false);
    expect(await check(collegeA, revoked.value.email)).toBe(false);
    expect(await check(collegeA, freshEmail())).toBe(false);
    expect(await check(collegeB, usable.value.email)).toBe(false);
  });
});

describe('invitations.revoke', () => {
  it('revokes a pending (also an expired) invitation and reports the other states', async () => {
    const pending = await invite(collegeA);
    const expired = await invite(collegeA);
    await expire(expired.value);
    const accepted = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.claim(tx, accepted.value.id));
    const revoke = (college: TenantFixture, id: string) =>
      inCollege(college, (tx) => invitations.revoke(tx, id));

    expect(await revoke(collegeA, pending.value.id)).toBe('revoked');
    expect(await revoke(collegeA, pending.value.id)).toBe('not_pending');
    expect(await revoke(collegeA, expired.value.id)).toBe('revoked');
    expect(await revoke(collegeA, accepted.value.id)).toBe('not_pending');
    expect(await revoke(collegeA, UNKNOWN_ID)).toBe('not_found');
    expect(await revoke(collegeA, 'not-a-uuid')).toBe('not_found');
    expect(await lookup(pending.token)).toMatchObject({ status: 'revoked' });
  });

  it("cannot revoke another college's invitation", async () => {
    const inB = await invite(collegeB);
    expect(await inCollege(collegeA, (tx) => invitations.revoke(tx, inB.value.id))).toBe(
      'not_found',
    );
    expect((await storedRow(inB.value))?.status).toBe('pending');
  });
});

describe('invitations.findByTokenHash with withInvitationToken', () => {
  it('finds the invitation of any college by its token, without a college in context', async () => {
    const inA = await invite(collegeA, { role: 'admin' });
    const inB = await invite(collegeB);
    expect(await lookup(inA.token)).toEqual(inA.value);
    expect(await lookup(inB.token)).toEqual(inB.value);
    const found = await lookup(inA.token);
    expect(Object.keys(found ?? {})).not.toContain('tokenHash');
  });

  it('returns nothing for another or an unknown token', async () => {
    const inA = await invite(collegeA);
    const inB = await invite(collegeB);
    const hashA = hashInvitationToken(inA.token);
    const hashB = hashInvitationToken(inB.token);
    expect(
      await withInvitationToken(hashA, (tx) => invitations.findByTokenHash(tx, hashB)),
    ).toBeNull();
    expect(await lookup('Ef3'.repeat(14) + 'E')).toBeNull();
  });

  it('exposes only the matching invitation and no other tenant data, and allows no writes', async () => {
    const inA = await invite(collegeA);
    await invite(collegeA);
    await inCollege(collegeA, (tx) =>
      divisions.create(tx, { code: 'GEN', nameAr: 'عام', nameEn: 'General', sortOrder: 0 }),
    );
    const hashA = hashInvitationToken(inA.token);
    const seen = await withInvitationToken(hashA, async (tx) => ({
      listed: (await invitations.list(tx)).map((row) => row.id),
      divisions: await divisions.list(tx, { includeInactive: true }),
      claimed: await invitations.claim(tx, inA.value.id),
      revoked: await invitations.revoke(tx, inA.value.id),
    }));
    expect(seen).toEqual({
      listed: [inA.value.id],
      divisions: [],
      claimed: null,
      revoked: 'not_pending',
    });
    expect((await storedRow(inA.value))?.status).toBe('pending');
  });

  it("does not see another college's invitation by token inside withTenant", async () => {
    const inB = await invite(collegeB);
    const hashB = hashInvitationToken(inB.token);
    expect(await inCollege(collegeA, (tx) => invitations.findByTokenHash(tx, hashB))).toBeNull();
    expect(await inCollege(collegeB, (tx) => invitations.findByTokenHash(tx, hashB))).toEqual(
      inB.value,
    );
  });

  it('rejects anything that is not a SHA-256 hex digest before touching the database', async () => {
    let called = false;
    const attempt = (value: string) =>
      withInvitationToken(value, () => {
        called = true;
        return Promise.resolve(null);
      });
    await expect(attempt('Ab1'.repeat(14) + 'A')).rejects.toThrow(/SHA-256/);
    await expect(attempt('')).rejects.toThrow(/SHA-256/);
    await expect(attempt(hashInvitationToken('x').toUpperCase())).rejects.toThrow(/SHA-256/);
    expect(called).toBe(false);
  });

  it('does not leak the token setting to the next query on the same pooled connection', async () => {
    const inA = await invite(collegeA);
    await closePool();
    const hashA = hashInvitationToken(inA.token);
    const insidePid = await withInvitationToken(hashA, async (tx) => {
      const result = await tx.execute<{ pid: number; setting: string }>(
        sql`SELECT pg_backend_pid() AS pid, current_setting('app.invite_token_hash', true) AS setting`,
      );
      expect(result.rows[0]?.setting).toBe(hashA);
      return result.rows[0]?.pid;
    });
    expect(getPool().totalCount).toBe(1);
    const after = await runtimeQuery<{ pid: number; setting: string | null; visible: number }>(
      `SELECT pg_backend_pid() AS pid,
              current_setting('app.invite_token_hash', true) AS setting,
              (SELECT count(*)::int FROM invitations) AS visible`,
    );
    expect(after.rows[0]?.pid).toBe(insidePid);
    expect(after.rows[0]?.setting ?? '').toBe('');
    expect(after.rows[0]?.visible).toBe(0);
  });
});

describe('invitations.claim', () => {
  it('accepts a pending, unexpired invitation once', async () => {
    const { value } = await invite(collegeA);
    const claimed = await inCollege(collegeA, (tx) => invitations.claim(tx, value.id));
    expect(claimed).toMatchObject({ id: value.id, status: 'accepted', acceptedUserId: null });
    expect(claimed?.acceptedAt).toBeInstanceOf(Date);
    expect(await inCollege(collegeA, (tx) => invitations.claim(tx, value.id))).toBeNull();
  });

  it('refuses expired, revoked, unknown, and other colleges’ invitations', async () => {
    const expired = await invite(collegeA);
    await expire(expired.value);
    const revoked = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.revoke(tx, revoked.value.id));
    const inB = await invite(collegeB);
    const claim = (id: string) => inCollege(collegeA, (tx) => invitations.claim(tx, id));

    expect(await claim(expired.value.id)).toBeNull();
    expect(await claim(revoked.value.id)).toBeNull();
    expect(await claim(UNKNOWN_ID)).toBeNull();
    expect(await claim('not-a-uuid')).toBeNull();
    expect(await claim(inB.value.id)).toBeNull();
    expect((await storedRow(inB.value))?.status).toBe('pending');
  });

  it('lets exactly one of two concurrent claims succeed', async () => {
    const { value } = await invite(collegeA);
    // Two separate transactions on two connections, started together.
    const results = await Promise.all(
      [0, 1].map(() => inCollege(collegeA, (tx) => invitations.claim(tx, value.id))),
    );
    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });
});

describe('invitations.release and setAcceptedUser', () => {
  it('release makes a claimed invitation usable again', async () => {
    const { value, token } = await invite(collegeA);
    await inCollege(collegeA, (tx) => invitations.claim(tx, value.id));
    await inCollege(collegeA, (tx) => invitations.release(tx, value.id));
    expect(await lookup(token)).toMatchObject({ status: 'pending', acceptedAt: null });
    expect(await inCollege(collegeA, (tx) => invitations.claim(tx, value.id))).not.toBeNull();
  });

  it('setAcceptedUser links the account; release then leaves the invitation accepted', async () => {
    const { value, token } = await invite(collegeA);
    const user = await makeUser(collegeA.id);
    await inCollege(collegeA, (tx) => invitations.claim(tx, value.id));
    await inCollege(collegeA, (tx) => invitations.setAcceptedUser(tx, value.id, user.id));
    await inCollege(collegeA, (tx) => invitations.release(tx, value.id));
    expect(await lookup(token)).toMatchObject({ status: 'accepted', acceptedUserId: user.id });
  });

  it('setAcceptedUser throws for an unclaimed, unknown, or other college’s invitation', async () => {
    const pending = await invite(collegeA);
    const inB = await invite(collegeB);
    await inCollege(collegeB, (tx) => invitations.claim(tx, inB.value.id));
    const user = await makeUser(collegeA.id);
    const link = (id: string) =>
      inCollege(collegeA, (tx) => invitations.setAcceptedUser(tx, id, user.id));

    await expect(link(pending.value.id)).rejects.toThrow(/not claimed/);
    await expect(link(UNKNOWN_ID)).rejects.toThrow(/not claimed/);
    await expect(link('not-a-uuid')).rejects.toThrow(/not claimed/);
    await expect(link(inB.value.id)).rejects.toThrow(/not claimed/);
    expect((await storedRow(inB.value))?.accepted_user_id).toBeNull();
  });

  it('setAcceptedUser never overwrites an invitation already linked to an account', async () => {
    const { value } = await invite(collegeA);
    const first = await makeUser(collegeA.id);
    const second = await makeUser(collegeA.id);
    await inCollege(collegeA, (tx) => invitations.claim(tx, value.id));
    await inCollege(collegeA, (tx) => invitations.setAcceptedUser(tx, value.id, first.id));
    await expect(
      inCollege(collegeA, (tx) => invitations.setAcceptedUser(tx, value.id, second.id)),
    ).rejects.toThrow(/not claimed/);
    expect((await storedRow(value))?.accepted_user_id).toBe(first.id);
  });

  it("release does nothing to another college's claimed invitation", async () => {
    const inB = await invite(collegeB);
    await inCollege(collegeB, (tx) => invitations.claim(tx, inB.value.id));
    await inCollege(collegeA, (tx) => invitations.release(tx, inB.value.id));
    await inCollege(collegeA, (tx) => invitations.release(tx, 'not-a-uuid'));
    expect((await storedRow(inB.value))?.status).toBe('accepted');
  });
});
