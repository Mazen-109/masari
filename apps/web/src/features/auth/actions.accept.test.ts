import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail } from '@/lib/result';
import { acceptInvitationAction } from './actions';

// acceptInvitationAction (contracts/server-actions.md §4.7). e2e/college-onboarding.spec.ts drives the real
// library and database; here every collaborator is mocked to pin down the order of the steps, the context
// of each database call, and the compensation after failures the e2e tests cannot provoke.

const mocks = vi.hoisted(() => ({
  findUsableInvitation: vi.fn(),
  findByEmail: vi.fn(),
  activateInvited: vi.fn(),
  deleteJustCreated: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  setAcceptedUser: vi.fn(),
  withTenant: vi.fn(),
  signUpEmail: vi.fn(),
  recordAudit: vi.fn(),
  enforceRateLimit: vi.fn(),
  rateLimitRules: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT');
  }
}

vi.mock('@masari/db', () => ({
  tenants: {},
  sessions: {},
  users: {
    findByEmail: mocks.findByEmail,
    activateInvited: mocks.activateInvited,
    deleteJustCreated: mocks.deleteJustCreated,
  },
  invitations: {
    claim: mocks.claim,
    release: mocks.release,
    setAcceptedUser: mocks.setAcceptedUser,
  },
  withTenant: mocks.withTenant,
}));
vi.mock('better-auth/api', () => ({ isAPIError: () => false }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/server/auth/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/server/auth/invitation-lookup', () => ({
  findUsableInvitation: mocks.findUsableInvitation,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectSignal) throw error;
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en') }));
vi.mock('@/server/auth/auth', () => ({
  getAuth: () => ({ api: { signUpEmail: mocks.signUpEmail } }),
}));
vi.mock('@/server/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/env', () => ({ getEnv: () => ({ APP_URL: 'https://masari.example' }) }));
vi.mock('@/server/log', () => ({ log: mocks.log }));
vi.mock('@/server/request', () => ({ getClientIp: () => Promise.resolve('198.18.0.1') }));
vi.mock('@/server/rate-limit', () => ({
  rateLimitRules: mocks.rateLimitRules,
  enforceRateLimit: mocks.enforceRateLimit,
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user'.repeat(4);
const EMAIL = 'dean@example.test';
const TOKEN = `${'Iv4_'.repeat(10)}a-Z`;
const PASSWORD = 'Ab1'.repeat(4);

const INVITATION = {
  id: INVITATION_ID,
  tenantId: TENANT_ID,
  email: EMAIL,
  role: 'admin',
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000),
};
const CLAIMED = { ...INVITATION, status: 'accepted' };
const ACCOUNT = { id: USER_ID, tenantId: TENANT_ID, email: EMAIL };

const VALID = { token: TOKEN, name: 'Mona Ali', password: PASSWORD, consent: 'on' };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Runs the action; a redirect is returned as `{ redirect: url }`. */
async function submit(fields: Record<string, string> = VALID) {
  try {
    return await acceptInvitationAction(null, form(fields));
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    throw error;
  }
}

/** Every withTenant call as [tenantId, userId], in order. */
function contexts(): [string, string | null][] {
  return (mocks.withTenant.mock.calls as [{ tenantId: string; userId: string | null }][]).map(
    ([ctx]) => [ctx.tenantId, ctx.userId],
  );
}

beforeEach(() => {
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.rateLimitRules.mockReturnValue([]);
  mocks.findUsableInvitation.mockResolvedValue({ invitation: INVITATION, tenant: {} });
  // No account before the library creates one; afterwards the new account.
  mocks.findByEmail.mockResolvedValueOnce(null).mockResolvedValue(ACCOUNT);
  mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ tx: true }),
  );
  mocks.claim.mockResolvedValue(CLAIMED);
  mocks.signUpEmail.mockResolvedValue({ user: { id: USER_ID } });
  mocks.activateInvited.mockResolvedValue(undefined);
  mocks.setAcceptedUser.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.deleteJustCreated.mockResolvedValue(true);
  mocks.release.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('acceptInvitationAction', () => {
  it('claims, creates the account from the invitation, activates, links, audits, and redirects', async () => {
    const result = await submit({ ...VALID, email: 'other@example.test', role: 'student' });

    expect(result).toEqual({ redirect: '/en/sign-in?invited=1' });
    expect(mocks.rateLimitRules).toHaveBeenCalledWith('invite-accept', { ip: '198.18.0.1' });
    expect(mocks.findUsableInvitation).toHaveBeenCalledWith(TOKEN);
    expect(mocks.claim).toHaveBeenCalledWith({ tx: true }, INVITATION_ID);
    expect(mocks.signUpEmail).toHaveBeenCalledExactlyOnceWith({
      body: {
        name: 'Mona Ali',
        email: EMAIL,
        password: PASSWORD,
        tenantId: TENANT_ID,
        locale: 'en',
        privacyConsentAt: expect.any(Date) as unknown,
      },
    });
    expect(mocks.activateInvited).toHaveBeenCalledWith(TENANT_ID, USER_ID, 'admin');
    expect(mocks.setAcceptedUser).toHaveBeenCalledWith({ tx: true }, INVITATION_ID, USER_ID);
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      { action: 'invitation.accepted', targetId: INVITATION_ID, metadata: { role: 'admin' } },
      { tx: true },
    );
    // Claim without a user; link + audit in one transaction as the new user.
    expect(contexts()).toEqual([
      [TENANT_ID, null],
      [TENANT_ID, USER_ID],
    ]);
    expect(mocks.deleteJustCreated).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('answers token_invalid for a missing or malformed token, before rate limiting', async () => {
    expect(await submit({ ...VALID, token: '' })).toMatchObject({ code: 'token_invalid' });
    expect(await submit({ ...VALID, token: 'short' })).toMatchObject({ code: 'token_invalid' });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('returns field errors with the entered name and consent, never the password', async () => {
    const result = await submit({ token: TOKEN, name: 'M', password: 'short', consent: 'on' });
    expect(result).toEqual({
      ok: false,
      code: 'validation',
      fieldErrors: { name: 'too_short', password: 'password_too_short' },
      meta: { name: 'M', consent: 'on' },
    });
    expect(mocks.findUsableInvitation).not.toHaveBeenCalled();
  });

  it('returns the rate-limit refusal before looking the invitation up', async () => {
    const refusal = fail('rate_limited', { retryAfterSeconds: 42 });
    mocks.enforceRateLimit.mockResolvedValue(refusal);
    expect(await submit()).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 42 });
    expect(mocks.findUsableInvitation).not.toHaveBeenCalled();
  });

  it('answers token_invalid for an unusable invitation without claiming', async () => {
    mocks.findUsableInvitation.mockResolvedValue(null);
    expect(await submit()).toMatchObject({ code: 'token_invalid' });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('answers the same token_invalid when the address already has an account', async () => {
    mocks.findByEmail.mockReset().mockResolvedValue({ ...ACCOUNT, tenantId: 'elsewhere' });
    expect(await submit()).toMatchObject({ code: 'token_invalid' });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it('answers token_invalid when a concurrent submission claimed it first', async () => {
    mocks.claim.mockResolvedValue(null);
    expect(await submit()).toMatchObject({ code: 'token_invalid' });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it('deletes the new account and releases the claim when activation fails', async () => {
    mocks.activateInvited.mockRejectedValue(new Error('boom'));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.deleteJustCreated).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(mocks.release).toHaveBeenCalledWith({ tx: true }, INVITATION_ID);
    expect(mocks.deleteJustCreated.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.release.mock.invocationCallOrder[0] ?? 0,
    );
    expect(contexts().at(-1)).toEqual([TENANT_ID, null]);
    expect(mocks.log.error).toHaveBeenCalledWith('invitation.accept_failed', {
      invitationId: INVITATION_ID,
      errorName: 'Error',
      sqlState: null,
    });
  });

  it('compensates when linking or auditing fails, logging the SQLSTATE', async () => {
    mocks.recordAudit.mockRejectedValue(Object.assign(new Error('x'), { code: '23503' }));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.deleteJustCreated).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.log.error).toHaveBeenCalledWith(
      'invitation.accept_failed',
      expect.objectContaining({ sqlState: '23503' }),
    );
  });

  it('finds the account by email when the library failed without an answer', async () => {
    mocks.signUpEmail.mockRejectedValue(new Error('connection lost'));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.deleteJustCreated).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.activateInvited).not.toHaveBeenCalled();
  });

  it('never touches an account the library did not create (made-up user for an existing address)', async () => {
    mocks.signUpEmail.mockResolvedValue({ user: { id: 'made'.repeat(4) } });
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.activateInvited).not.toHaveBeenCalled();
    expect(mocks.deleteJustCreated).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('never activates an account of another college', async () => {
    mocks.findByEmail
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        ...ACCOUNT,
        tenantId: '33333333-3333-4333-8333-333333333333',
      });
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.activateInvited).not.toHaveBeenCalled();
    expect(mocks.deleteJustCreated).not.toHaveBeenCalled();
  });

  it('deletes the account the library returned when the read-back throws, then releases', async () => {
    mocks.findByEmail
      .mockReset()
      .mockResolvedValueOnce(null) // step 4: no account yet
      .mockRejectedValueOnce(new Error('read-back failed')) // read-back after the library answered
      .mockResolvedValue(ACCOUNT); // compensation lookup
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.activateInvited).not.toHaveBeenCalled();
    expect(mocks.deleteJustCreated).toHaveBeenCalledExactlyOnceWith(TENANT_ID, USER_ID);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.deleteJustCreated.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.release.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('leaves the claim in place when deleting the account fails, logging ids only', async () => {
    mocks.activateInvited.mockRejectedValue(new Error('boom'));
    mocks.deleteJustCreated.mockRejectedValue(new TypeError(`cannot delete ${EMAIL}`));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.log.error).toHaveBeenCalledWith('invitation.accept_compensation_failed', {
      step: 'delete_account',
      invitationId: INVITATION_ID,
      errorName: 'TypeError',
    });
    // Not released: a pending invitation whose address already has an account could never be used.
    expect(mocks.release).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(EMAIL);
  });

  it('leaves the claim in place when the compensation lookup fails', async () => {
    mocks.signUpEmail.mockRejectedValue(new Error('connection lost'));
    mocks.findByEmail.mockReset().mockResolvedValueOnce(null).mockRejectedValue(new Error('down'));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.deleteJustCreated).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledWith(
      'invitation.accept_compensation_failed',
      expect.objectContaining({ step: 'delete_account' }),
    );
  });

  it('logs a failing release and still answers internal', async () => {
    mocks.activateInvited.mockRejectedValue(new Error('boom'));
    mocks.release.mockRejectedValue(new Error('down'));
    expect(await submit()).toMatchObject({ code: 'internal' });
    expect(mocks.log.error).toHaveBeenCalledWith('invitation.accept_compensation_failed', {
      step: 'release',
      invitationId: INVITATION_ID,
      errorName: 'Error',
    });
  });

  it('answers internal without leaking an unexpected error before the claim', async () => {
    mocks.findUsableInvitation.mockRejectedValue(new Error(`lookup failed for ${EMAIL}`));
    const result = await submit();
    expect(result).toMatchObject({ ok: false, code: 'internal' });
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(mocks.log.error).toHaveBeenCalledWith('invitation.accept_failed', {
      errorName: 'Error',
      sqlState: null,
    });
  });
});
