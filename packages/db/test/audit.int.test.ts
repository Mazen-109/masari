import { asc, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withTenant, type Tx } from '../src/context';
import * as audit from '../src/repositories/audit';
import { auditEvents } from '../src/schema';
import {
  closeTestPools,
  inRuntimeTransaction,
  makeTenant,
  makeUser,
  pgErrorCode,
  runtimeQuery,
  type TenantFixture,
} from './helpers';

// contracts/db-api.md §4: insert + read within the college; UPDATE/DELETE denied; cross-college invisible.
// Since PR-12 the actor is a foreign key to users (data-model.md §3.8).

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

function readEvents(college: TenantFixture) {
  return inCollege(college, (tx) =>
    tx.select().from(auditEvents).orderBy(asc(auditEvents.createdAt), asc(auditEvents.action)),
  );
}

describe('audit.record', () => {
  it('stores an event in the college in context and it can be read back there', async () => {
    await inCollege(collegeA, (tx) =>
      audit.record(tx, {
        actorUserId: null,
        action: 'division.created',
        targetType: 'division',
        targetId: '11111111-1111-4111-8111-111111111111',
        metadata: { fields: ['nameAr', 'nameEn'] },
        ip: '203.0.113.7',
      }),
    );
    const events = await readEvents(collegeA);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: collegeA.id,
      actorUserId: null,
      action: 'division.created',
      targetType: 'division',
      targetId: '11111111-1111-4111-8111-111111111111',
      metadata: { fields: ['nameAr', 'nameEn'] },
      ip: '203.0.113.7',
    });
    expect(events[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('stores empty metadata and NULL target and ip when they are omitted', async () => {
    await inCollege(collegeA, (tx) =>
      audit.record(tx, { actorUserId: null, action: 'auth.sign_in' }),
    );
    expect(await readEvents(collegeA)).toEqual([
      expect.objectContaining({ metadata: {}, targetType: null, targetId: null, ip: null }),
    ]);
  });

  it('stores a real user as the actor', async () => {
    const user = await makeUser(collegeA.id);
    await inCollege(collegeA, (tx) =>
      audit.record(tx, {
        actorUserId: user.id,
        action: 'auth.sign_in',
        targetType: 'user',
        targetId: user.id,
      }),
    );
    expect(await readEvents(collegeA)).toEqual([
      expect.objectContaining({ actorUserId: user.id, targetId: user.id }),
    ]);
  });

  it('rejects an actor id that is not an existing user (foreign key)', async () => {
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        audit.record(tx, { actorUserId: 'no-such-user', action: 'auth.sign_in' }),
      ),
    );
    expect(code).toBe('23503');
    expect(await readEvents(collegeA)).toEqual([]);
  });

  it('rejects an action longer than 64 characters (CHECK constraint)', async () => {
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) => audit.record(tx, { actorUserId: null, action: 'a'.repeat(65) })),
    );
    expect(code).toBe('23514');
  });

  it('is refused without a tenant context', async () => {
    const code = await pgErrorCode(
      runtimeQuery(`INSERT INTO audit_events (action) VALUES ('auth.sign_in')`),
    );
    expect(code).toBe('42501');
  });

  it('rolls back with the surrounding transaction', async () => {
    await expect(
      inCollege(collegeA, async (tx) => {
        await audit.record(tx, { actorUserId: null, action: 'user.registered' });
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    expect(await readEvents(collegeA)).toEqual([]);
  });
});

describe('audit isolation between colleges', () => {
  it("never shows one college's events to another", async () => {
    await inCollege(collegeA, (tx) =>
      audit.record(tx, { actorUserId: null, action: 'auth.sign_in' }),
    );
    await inCollege(collegeB, (tx) =>
      audit.record(tx, { actorUserId: null, action: 'auth.sign_out' }),
    );
    expect((await readEvents(collegeA)).map((event) => event.action)).toEqual(['auth.sign_in']);
    expect((await readEvents(collegeB)).map((event) => event.action)).toEqual(['auth.sign_out']);
    expect((await runtimeQuery('SELECT * FROM audit_events')).rowCount).toBe(0);
  });

  it("refuses an event written into another college's log", async () => {
    const code = await pgErrorCode(
      inCollege(collegeA, (tx) =>
        tx.execute(
          sql`INSERT INTO audit_events (tenant_id, action) VALUES (${collegeB.id}::uuid, 'forged')`,
        ),
      ),
    );
    expect(code).toBe('42501');
    expect(await readEvents(collegeB)).toEqual([]);
  });
});

describe('audit log is append-only for the runtime role', () => {
  it.each([
    ['UPDATE', `UPDATE audit_events SET action = 'tampered'`],
    ['DELETE', 'DELETE FROM audit_events'],
  ])('%s fails with a permission error, even in the own college', async (_label, statement) => {
    await inCollege(collegeA, (tx) =>
      audit.record(tx, { actorUserId: null, action: 'auth.sign_in' }),
    );
    const code = await pgErrorCode(
      inRuntimeTransaction(async (client) => {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [collegeA.id]);
        return client.query(statement);
      }),
    );
    expect(code).toBe('42501');
    expect((await readEvents(collegeA)).map((event) => event.action)).toEqual(['auth.sign_in']);
  });
});
