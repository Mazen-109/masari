import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findUsableInvitation, isUsableInvitation } from './invitation-lookup';

// contracts/server-actions.md §4.7 step 3. The repositories are mocked; the RLS behaviour of the token
// lookup is proved in packages/db/test/invitations.int.test.ts and the whole flow in
// e2e/college-onboarding.spec.ts.

const mocks = vi.hoisted(() => ({
  withInvitationToken: vi.fn(),
  findByTokenHash: vi.fn(),
  findById: vi.fn(),
  hashInvitationToken: vi.fn(),
}));

vi.mock('@masari/db', () => ({
  withInvitationToken: mocks.withInvitationToken,
  hashInvitationToken: mocks.hashInvitationToken,
  invitations: { findByTokenHash: mocks.findByTokenHash },
  tenants: { findById: mocks.findById },
}));

const TOKEN = `${'Iv4_'.repeat(10)}a-Z`;
const HASH = 'ab'.repeat(32);
const TX = { tx: true };
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60 * 1000;

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: TENANT_ID,
    email: 'dean@example.test',
    role: 'admin',
    status: 'pending',
    expiresAt: new Date(Date.now() + HOUR),
    ...overrides,
  };
}

const TENANT = { id: TENANT_ID, status: 'active' as const, nameAr: 'كلية', nameEn: 'College' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hashInvitationToken.mockReturnValue(HASH);
  mocks.withInvitationToken.mockImplementation(
    (_hash: string, fn: (tx: unknown) => Promise<unknown>) => fn(TX),
  );
  mocks.findByTokenHash.mockResolvedValue(invitation());
  mocks.findById.mockResolvedValue(TENANT);
});

describe('isUsableInvitation', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  const later = new Date('2026-11-18T10:00:01Z');

  it('accepts only a pending, unexpired invitation of an active college', () => {
    expect(isUsableInvitation({ status: 'pending', expiresAt: later }, TENANT, now)).toBe(true);
    expect(isUsableInvitation({ status: 'pending', expiresAt: now }, TENANT, now)).toBe(false);
    expect(isUsableInvitation({ status: 'accepted', expiresAt: later }, TENANT, now)).toBe(false);
    expect(isUsableInvitation({ status: 'revoked', expiresAt: later }, TENANT, now)).toBe(false);
    expect(
      isUsableInvitation({ status: 'pending', expiresAt: later }, { status: 'suspended' }, now),
    ).toBe(false);
    expect(isUsableInvitation(null, TENANT, now)).toBe(false);
    expect(isUsableInvitation({ status: 'pending', expiresAt: later }, null, now)).toBe(false);
  });
});

describe('findUsableInvitation', () => {
  it('looks the hash up in the token context, then the college, and returns both', async () => {
    const found = await findUsableInvitation(TOKEN);

    expect(found).toEqual({
      invitation: invitation({ expiresAt: expect.any(Date) }),
      tenant: TENANT,
    });
    expect(mocks.hashInvitationToken).toHaveBeenCalledWith(TOKEN);
    expect(mocks.withInvitationToken).toHaveBeenCalledWith(HASH, expect.any(Function));
    expect(mocks.findByTokenHash).toHaveBeenCalledWith(TX, HASH);
    expect(mocks.findById).toHaveBeenCalledWith(TENANT_ID);
  });

  it.each([
    ['too short', TOKEN.slice(1)],
    ['too long', `${TOKEN}x`],
    ['with other characters', `${TOKEN.slice(2)}/=`],
    ['empty', ''],
  ])('returns null for a token %s without touching the database', async (_label, token) => {
    expect(await findUsableInvitation(token)).toBeNull();
    expect(mocks.withInvitationToken).not.toHaveBeenCalled();
  });

  it('returns null for an unknown token without reading the college', async () => {
    mocks.findByTokenHash.mockResolvedValue(null);
    expect(await findUsableInvitation(TOKEN)).toBeNull();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it.each([
    ['used', invitation({ status: 'accepted' }), TENANT],
    ['revoked', invitation({ status: 'revoked' }), TENANT],
    ['expired', invitation({ expiresAt: new Date(Date.now() - 1000) }), TENANT],
    ['of a suspended college', invitation(), { ...TENANT, status: 'suspended' }],
    ['of a missing college', invitation(), null],
  ])('returns null for an invitation %s', async (_label, found, tenant) => {
    mocks.findByTokenHash.mockResolvedValue(found);
    mocks.findById.mockResolvedValue(tenant);
    expect(await findUsableInvitation(TOKEN)).toBeNull();
  });
});
