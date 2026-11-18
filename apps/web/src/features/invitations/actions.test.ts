import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { createInvitationAction, revokeInvitationAction } from './actions';

// createInvitationAction (contracts/server-actions.md §5.2): the branches the e2e tests cannot reach —
// a failing email, a concurrent create, unexpected errors — and the rule that "has an account" and
// "already invited" do the same work and get the same answer. Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  hasUsablePending: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  withTenant: vi.fn(),
  recordAudit: vi.fn(),
  getActionContext: vi.fn(),
  sendEmail: vi.fn(),
  revalidatePath: vi.fn(),
  enforceRateLimit: vi.fn(),
  rateLimitRules: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({
  ROLES: ['student', 'faculty', 'student_affairs', 'admin'],
  users: { findByEmail: mocks.findByEmail },
  invitations: {
    hasUsablePending: mocks.hasUsablePending,
    create: mocks.createInvitation,
    revoke: mocks.revokeInvitation,
  },
  withTenant: mocks.withTenant,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/email/send', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/server/env', () => ({ getEnv: () => ({ APP_URL: 'https://masari.example' }) }));
vi.mock('@/server/log', () => ({ log: mocks.log }));
vi.mock('@/server/rate-limit', () => ({
  rateLimitRules: mocks.rateLimitRules,
  enforceRateLimit: mocks.enforceRateLimit,
}));

const ADMIN_ID = 'admn'.repeat(4);
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'Tk7_'.repeat(8);
const EMAIL = 'dean@college.example';
const TX = { fake: 'tx' };

const CTX = {
  user: {
    id: ADMIN_ID,
    name: 'Admin',
    email: 'admin@college.example',
    role: 'admin',
    locale: 'ar',
  },
  tenant: { id: TENANT_ID, nameAr: 'كلية التجربة', nameEn: 'Trial College' },
  studentProfile: null,
};

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    email: ` ${EMAIL.toUpperCase()} `,
    role: 'faculty',
    ...overrides,
  })) {
    data.append(key, value);
  }
  return data;
}

const ENTERED = { email: ` ${EMAIL.toUpperCase()} `, role: 'faculty' };

const UNAVAILABLE = fail('validation', {
  fieldErrors: { email: 'email_unavailable' },
  meta: ENTERED,
});

/** Every log line written, flattened to text (to assert what never appears in it). */
function loggedText(): string {
  return JSON.stringify([
    ...mocks.log.info.mock.calls,
    ...mocks.log.warn.mock.calls,
    ...mocks.log.error.mock.calls,
  ]);
}

beforeEach(() => {
  mocks.getActionContext.mockResolvedValue({ ctx: CTX });
  mocks.rateLimitRules.mockReturnValue([
    { key: 'invite-create:user:x', limit: 60, windowSeconds: 3600 },
  ]);
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.findByEmail.mockResolvedValue(null);
  mocks.hasUsablePending.mockResolvedValue(false);
  mocks.createInvitation.mockResolvedValue({
    ok: true,
    value: { id: INVITATION_ID, email: EMAIL, role: 'faculty' },
    token: TOKEN,
  });
  mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(TX));
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.sendEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('createInvitationAction', () => {
  it('creates the invitation, audits it in the same transaction, emails the link, and revalidates', async () => {
    expect(await createInvitationAction(null, form())).toEqual(ok(undefined));

    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.invitations.manage');
    expect(mocks.rateLimitRules).toHaveBeenCalledExactlyOnceWith('invite-create', {
      user: ADMIN_ID,
    });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: ADMIN_ID },
      expect.any(Function),
    );
    expect(mocks.createInvitation).toHaveBeenCalledExactlyOnceWith(TX, {
      email: EMAIL,
      role: 'faculty',
      invitedBy: ADMIN_ID,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      { action: 'invitation.created', targetId: INVITATION_ID, metadata: { role: 'faculty' } },
      TX,
    );
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const message = mocks.sendEmail.mock.calls[0]?.[0] as {
      template: string;
      to: string;
      text: string;
    };
    expect(message.template).toBe('invitation');
    expect(message.to).toBe(EMAIL);
    expect(message.text).toContain(`https://masari.example/ar/invite/${TOKEN}`);
    expect(mocks.log.info).toHaveBeenCalledWith('email.sent', {
      template: 'invitation',
      invitationId: INVITATION_ID,
    });
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path as string)).toEqual([
      '/ar/admin/invitations',
      '/en/admin/invitations',
    ]);
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(TOKEN);
  });

  it.each([
    ['has an account', () => mocks.findByEmail.mockResolvedValue({ id: 'u'.repeat(16) })],
    [
      'already has a usable pending invitation',
      () => mocks.hasUsablePending.mockResolvedValue(true),
    ],
    [
      'loses a concurrent create',
      () => mocks.createInvitation.mockResolvedValue({ ok: false, reason: 'pending_exists' }),
    ],
  ])(
    'answers email_unavailable when the address %s, creating and sending nothing',
    async (_case, arrange) => {
      arrange();
      expect(await createInvitationAction(null, form())).toEqual(UNAVAILABLE);
      // The same lookups run in every case, so the refusals cannot be told apart by their work.
      expect(mocks.findByEmail).toHaveBeenCalledExactlyOnceWith(EMAIL);
      expect(mocks.hasUsablePending).toHaveBeenCalledExactlyOnceWith(TX, EMAIL);
      expect(mocks.recordAudit).not.toHaveBeenCalled();
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('does not create when the address has an account', async () => {
    mocks.findByEmail.mockResolvedValue({ id: 'u'.repeat(16) });
    await createInvitationAction(null, form());
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it('answers the guard failure and does nothing else', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await createInvitationAction(null, form())).toEqual(fail('forbidden'));
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('answers validation with the entered values and does not count a rate-limit hit', async () => {
    expect(await createInvitationAction(null, form({ email: 'nope', role: 'owner' }))).toEqual(
      fail('validation', {
        fieldErrors: { email: 'invalid_email', role: 'invalid_choice' },
        meta: { email: 'nope', role: 'owner' },
      }),
    );
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers rate_limited before any lookup', async () => {
    mocks.enforceRateLimit.mockResolvedValue(fail('rate_limited', { retryAfterSeconds: 120 }));
    expect(await createInvitationAction(null, form())).toEqual(
      fail('rate_limited', { retryAfterSeconds: 120, meta: ENTERED }),
    );
    expect(mocks.findByEmail).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('keeps the invitation pending and answers internal when the email fails, logging ids only', async () => {
    mocks.sendEmail.mockRejectedValue(new Error(`SMTP refused ${EMAIL}`));
    expect(await createInvitationAction(null, form())).toEqual(fail('internal', { meta: ENTERED }));
    expect(mocks.recordAudit).toHaveBeenCalledOnce();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('email.failed', {
      template: 'invitation',
      invitationId: INVITATION_ID,
      errorName: 'Error',
    });
    // The pending invitation shows in the list, where the administrator can revoke it.
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(TOKEN);
  });

  it('answers internal on an unexpected error, logging only the error class and SQLSTATE', async () => {
    const cause = Object.assign(new Error(`duplicate key ${EMAIL}`), { code: '23505' });
    mocks.withTenant.mockRejectedValue(new Error('Failed query', { cause }));
    expect(await createInvitationAction(null, form())).toEqual(fail('internal', { meta: ENTERED }));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('invitation.create_failed', {
      errorName: 'Error',
      sqlState: '23505',
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(EMAIL);
  });

  it('logs a null SQLSTATE for an error without one', async () => {
    mocks.findByEmail.mockRejectedValue(new TypeError('boom'));
    expect(await createInvitationAction(null, form())).toEqual(fail('internal', { meta: ENTERED }));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('invitation.create_failed', {
      errorName: 'TypeError',
      sqlState: null,
    });
  });
});

describe('revokeInvitationAction', () => {
  function revokeForm(invitationId?: string): FormData {
    const data = new FormData();
    if (invitationId !== undefined) data.append('invitationId', invitationId);
    return data;
  }

  it('revokes, audits in the same transaction, and revalidates both languages', async () => {
    mocks.revokeInvitation.mockResolvedValue('revoked');
    expect(await revokeInvitationAction(null, revokeForm(` ${INVITATION_ID} `))).toEqual(
      ok(undefined),
    );
    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.invitations.manage');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: ADMIN_ID },
      expect.any(Function),
    );
    expect(mocks.revokeInvitation).toHaveBeenCalledExactlyOnceWith(TX, INVITATION_ID);
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      { action: 'invitation.revoked', targetId: INVITATION_ID },
      TX,
    );
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path as string)).toEqual([
      '/ar/admin/invitations',
      '/en/admin/invitations',
    ]);
  });

  it("answers not_found for an unknown or another college's id, changing and auditing nothing", async () => {
    mocks.revokeInvitation.mockResolvedValue('not_found');
    expect(await revokeInvitationAction(null, revokeForm(INVITATION_ID))).toEqual(
      fail('not_found'),
    );
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('answers conflict for an invitation no longer pending and refreshes the list', async () => {
    mocks.revokeInvitation.mockResolvedValue('not_pending');
    expect(await revokeInvitationAction(null, revokeForm(INVITATION_ID))).toEqual(fail('conflict'));
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it.each([[undefined], [''], ['x'.repeat(65)]])(
    'answers not_found for a missing or malformed id %j without touching the database',
    async (invitationId) => {
      expect(await revokeInvitationAction(null, revokeForm(invitationId))).toEqual(
        fail('not_found'),
      );
      expect(mocks.withTenant).not.toHaveBeenCalled();
    },
  );

  it('answers the guard failure and does nothing else', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await revokeInvitationAction(null, revokeForm(INVITATION_ID))).toEqual(
      fail('forbidden'),
    );
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('answers internal on an unexpected error, logging only the error class and SQLSTATE', async () => {
    const cause = Object.assign(new Error(`failed for ${INVITATION_ID}`), { code: '40001' });
    mocks.revokeInvitation.mockRejectedValue(new Error('Failed query', { cause }));
    expect(await revokeInvitationAction(null, revokeForm(INVITATION_ID))).toEqual(fail('internal'));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('invitation.revoke_failed', {
      errorName: 'Error',
      sqlState: '40001',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
