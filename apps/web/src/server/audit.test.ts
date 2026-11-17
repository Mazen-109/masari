import type { AuditEventInput, Tx } from '@masari/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionContext } from '@/server/auth/session';
import {
  AUDIT_CATALOGUE,
  AuditEventError,
  MAX_METADATA_STRING_LENGTH,
  recordAudit,
  type AuditEvent,
} from './audit';

const db = vi.hoisted(() => ({
  record: vi.fn<(tx: unknown, event: AuditEventInput) => Promise<void>>(),
  withTenant: vi.fn(),
}));
const getClientIp = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock('@masari/db', () => ({
  audit: { record: db.record },
  withTenant: db.withTenant,
}));
vi.mock('@/server/request', () => ({ getClientIp }));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user'.repeat(4);
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const callerTx = { name: 'caller-tx' } as unknown as Tx;
const ownTx = { name: 'own-tx' } as unknown as Tx;

const session: SessionContext = {
  user: { id: USER_ID, name: 'Test', email: 'test@example.edu', role: 'admin', locale: 'ar' },
  tenant: {
    id: TENANT_ID,
    slug: 'demo',
    nameAr: 'تجريبي',
    nameEn: 'Demo',
    levelsCount: 4,
    enabledModules: [],
    allowedEmailDomains: [],
  },
  studentProfile: null,
};

function arrange(ip: string | null = '203.0.113.5') {
  getClientIp.mockResolvedValue(ip);
  db.record.mockResolvedValue(undefined);
  db.withTenant.mockImplementation((_ctx: unknown, fn: (tx: Tx) => Promise<unknown>) => fn(ownTx));
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('recordAudit', () => {
  it('writes in the caller transaction when tx is given, without opening another one', async () => {
    arrange();
    await recordAudit(
      session,
      {
        action: 'user.role_changed',
        targetId: TARGET_ID,
        metadata: { from: 'student', to: 'faculty' },
      },
      callerTx,
    );
    expect(db.withTenant).not.toHaveBeenCalled();
    expect(db.record).toHaveBeenCalledExactlyOnceWith(callerTx, {
      actorUserId: USER_ID,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: TARGET_ID,
      metadata: { from: 'student', to: 'faculty' },
      ip: '203.0.113.5',
    });
  });

  it("opens its own withTenant for the actor's college when no tx is given", async () => {
    arrange(null);
    await recordAudit(
      { tenantId: TENANT_ID, userId: USER_ID },
      { action: 'auth.sign_in', targetId: USER_ID },
    );
    expect(db.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.any(Function),
    );
    expect(db.record).toHaveBeenCalledExactlyOnceWith(ownTx, {
      actorUserId: USER_ID,
      action: 'auth.sign_in',
      targetType: 'user',
      targetId: USER_ID,
      metadata: {},
      ip: null,
    });
  });

  it('takes the tenant and user from a session context', async () => {
    arrange();
    await recordAudit(session, { action: 'invitation.revoked', targetId: TARGET_ID });
    expect(db.withTenant).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.any(Function),
    );
  });

  it('records a system event with a null actor', async () => {
    arrange();
    await recordAudit(
      { tenantId: TENANT_ID, userId: null },
      { action: 'invitation.created', targetId: TARGET_ID, metadata: { role: 'admin' } },
    );
    expect(db.record.mock.calls[0]?.[1].actorUserId).toBeNull();
  });

  it('stores a NULL address when it cannot be read (outside a request)', async () => {
    arrange();
    getClientIp.mockRejectedValue(new Error('headers was called outside a request scope'));
    await recordAudit(session, { action: 'auth.sign_out', targetId: USER_ID }, callerTx);
    expect(db.record.mock.calls[0]?.[1].ip).toBeNull();
  });

  it('accepts string lists of field names', async () => {
    arrange();
    await recordAudit(
      session,
      {
        action: 'tenant.settings_updated',
        targetId: TENANT_ID,
        metadata: { fields: ['nameAr', 'levelsCount'] },
      },
      callerTx,
    );
    expect(db.record.mock.calls[0]?.[1].metadata).toEqual({ fields: ['nameAr', 'levelsCount'] });
  });

  it('leaves out metadata keys whose value is undefined instead of rejecting them', async () => {
    arrange();
    const changed: string[] = [];
    await recordAudit(
      session,
      {
        action: 'profile.updated',
        targetId: TARGET_ID,
        metadata: { fields: changed.length > 0 ? changed : undefined },
      },
      callerTx,
    );
    expect(db.record).toHaveBeenCalledOnce();
    expect(db.record.mock.calls[0]?.[1].metadata).toEqual({});
    expect(Object.keys(db.record.mock.calls[0]?.[1].metadata ?? {})).toEqual([]);
  });

  it('rejects a key outside the catalogue entry even when its value is undefined', async () => {
    arrange();
    await expect(
      recordAudit(
        session,
        {
          action: 'auth.sign_in',
          targetId: USER_ID,
          metadata: { email: undefined },
        } as unknown as AuditEvent,
        callerTx,
      ),
    ).rejects.toBeInstanceOf(AuditEventError);
    expect(db.record).not.toHaveBeenCalled();
  });

  it(`accepts a metadata string of exactly ${MAX_METADATA_STRING_LENGTH} characters`, async () => {
    arrange();
    const value = 'a'.repeat(MAX_METADATA_STRING_LENGTH);
    await recordAudit(
      session,
      { action: 'invitation.accepted', targetId: TARGET_ID, metadata: { role: value } },
      callerTx,
    );
    expect(db.record).toHaveBeenCalledOnce();
  });

  describe('rejects, before any database call,', () => {
    const invalid: [string, AuditEvent][] = [
      [
        'a free-text metadata value longer than 64 characters',
        { action: 'invitation.accepted', targetId: TARGET_ID, metadata: { role: 'a'.repeat(65) } },
      ],
      [
        'a list item longer than 64 characters',
        {
          action: 'profile.updated',
          targetId: TARGET_ID,
          metadata: { fields: ['level', 'x'.repeat(65)] },
        },
      ],
      [
        'a list longer than 20 items',
        {
          action: 'profile.updated',
          targetId: TARGET_ID,
          metadata: { fields: Array.from({ length: 21 }, (_, i) => `f${i}`) },
        },
      ],
      [
        'a metadata key not in the catalogue entry',
        {
          action: 'auth.sign_in',
          targetId: USER_ID,
          metadata: { email: 'someone@example.edu' },
        } as unknown as AuditEvent,
      ],
      [
        'an object metadata value',
        {
          action: 'invitation.created',
          targetId: TARGET_ID,
          metadata: { role: { nested: true } },
        } as unknown as AuditEvent,
      ],
      [
        'a non-finite number',
        { action: 'invitation.created', targetId: TARGET_ID, metadata: { role: Number.NaN } },
      ],
      [
        'an action outside the catalogue',
        { action: 'user.deleted', targetId: TARGET_ID } as unknown as AuditEvent,
      ],
      ['an empty target id', { action: 'auth.sign_in', targetId: '' }],
      [
        'a target id longer than 64 characters',
        { action: 'auth.sign_in', targetId: 'x'.repeat(65) },
      ],
    ];

    it.each(invalid)('%s', async (_name, event) => {
      arrange();
      await expect(recordAudit(session, event, callerTx)).rejects.toBeInstanceOf(AuditEventError);
      await expect(recordAudit(session, event)).rejects.toBeInstanceOf(AuditEventError);
      expect(db.record).not.toHaveBeenCalled();
      expect(db.withTenant).not.toHaveBeenCalled();
    });

    it('without echoing the rejected value in the error message', async () => {
      arrange();
      const secret = 'someone@example.edu'.padEnd(70, '.');
      const error = await recordAudit(session, {
        action: 'invitation.created',
        targetId: TARGET_ID,
        metadata: { role: secret },
      }).catch((e: unknown) => e);
      expect(String(error)).not.toContain('someone@example.edu');
    });
  });

  it('uses the target type of data-model.md §3.8 for every catalogue action', () => {
    expect(
      Object.fromEntries(
        Object.entries(AUDIT_CATALOGUE).map(([action, entry]) => [action, entry.target]),
      ),
    ).toEqual({
      'user.registered': 'user',
      'auth.sign_in': 'user',
      'auth.sign_out': 'user',
      'auth.password_reset_requested': 'user',
      'auth.password_reset': 'user',
      'invitation.created': 'invitation',
      'invitation.revoked': 'invitation',
      'invitation.accepted': 'invitation',
      'user.role_changed': 'user',
      'user.suspended': 'user',
      'user.reactivated': 'user',
      'profile.created': 'student_profile',
      'profile.updated': 'student_profile',
      'tenant.settings_updated': 'tenant',
      'tenant.modules_updated': 'tenant',
      'division.created': 'division',
      'division.updated': 'division',
      'division.activated': 'division',
      'division.deactivated': 'division',
    });
  });
});
