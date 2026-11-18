import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { changeUserRoleAction, setUserStatusAction } from './actions';

// changeUserRoleAction and setUserStatusAction (contracts/server-actions.md §5.3): the order of the steps,
// the no-op and race branches the e2e tests cannot reach, the session revocation on suspend, and what is
// (never) logged. Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  findInTenant: vi.fn(),
  setRole: vi.fn(),
  setStatus: vi.fn(),
  revokeAllForUser: vi.fn(),
  recordAudit: vi.fn(),
  getActionContext: vi.fn(),
  revalidatePath: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({
  ROLES: ['student', 'faculty', 'student_affairs', 'admin'],
  USER_STATUSES: ['active', 'suspended'],
  users: {
    findInTenant: mocks.findInTenant,
    setRole: mocks.setRole,
    setStatus: mocks.setStatus,
  },
  sessions: { revokeAllForUser: mocks.revokeAllForUser },
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

const ADMIN_ID = 'admn'.repeat(4);
const TARGET_ID = 'trgt'.repeat(4);
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_NAME = 'Mona Target';
const TARGET_EMAIL = 'mona.target@college.example';

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

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    tenantId: TENANT_ID,
    name: TARGET_NAME,
    email: TARGET_EMAIL,
    emailVerified: true,
    role: 'faculty',
    status: 'active',
    locale: 'ar',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

/** Every log line written, flattened to text (to assert what never appears in it). */
function loggedText(): string {
  return JSON.stringify([
    ...mocks.log.info.mock.calls,
    ...mocks.log.warn.mock.calls,
    ...mocks.log.error.mock.calls,
  ]);
}

function expectNothingChanged(): void {
  expect(mocks.setRole).not.toHaveBeenCalled();
  expect(mocks.setStatus).not.toHaveBeenCalled();
  expect(mocks.revokeAllForUser).not.toHaveBeenCalled();
  expect(mocks.recordAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  mocks.getActionContext.mockResolvedValue({ ctx: CTX });
  mocks.findInTenant.mockResolvedValue(target());
  mocks.setRole.mockResolvedValue({ from: 'faculty', to: 'student_affairs' });
  mocks.setStatus.mockResolvedValue(true);
  mocks.revokeAllForUser.mockResolvedValue(2);
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('changeUserRoleAction', () => {
  const valid = { userId: TARGET_ID, role: 'student_affairs' };

  it('changes the role in the caller’s college, audits from/to, and revalidates both languages', async () => {
    expect(await changeUserRoleAction(null, form(valid))).toEqual(ok(undefined));

    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.users.manage');
    expect(mocks.findInTenant).toHaveBeenCalledExactlyOnceWith(TENANT_ID, TARGET_ID);
    expect(mocks.setRole).toHaveBeenCalledExactlyOnceWith(TENANT_ID, TARGET_ID, 'student_affairs');
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(CTX, {
      action: 'user.role_changed',
      targetId: TARGET_ID,
      metadata: { from: 'faculty', to: 'student_affairs' },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/admin/users');
    expect(mocks.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('returns the guard’s refusal before reading the form', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await changeUserRoleAction(null, form(valid))).toEqual(fail('forbidden'));
    expect(mocks.findInTenant).not.toHaveBeenCalled();
    expectNothingChanged();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses the administrator’s own account with forbidden', async () => {
    expect(await changeUserRoleAction(null, form({ ...valid, userId: ADMIN_ID }))).toEqual(
      fail('forbidden'),
    );
    expect(mocks.findInTenant).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it('answers not_found for an account the college does not have', async () => {
    mocks.findInTenant.mockResolvedValue(null);
    expect(await changeUserRoleAction(null, form(valid))).toEqual(fail('not_found'));
    expectNothingChanged();
  });

  it('answers not_found when the account disappears between the lookup and the change', async () => {
    mocks.setRole.mockResolvedValue(null);
    expect(await changeUserRoleAction(null, form(valid))).toEqual(fail('not_found'));
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers not_found for a missing or malformed hidden id', async () => {
    expect(await changeUserRoleAction(null, form({ role: 'faculty' }))).toEqual(fail('not_found'));
    expect(
      await changeUserRoleAction(null, form({ userId: 'x'.repeat(65), role: 'faculty' })),
    ).toEqual(fail('not_found'));
    expectNothingChanged();
  });

  it('refuses an unknown role with a field error', async () => {
    expect(await changeUserRoleAction(null, form({ ...valid, role: 'owner' }))).toEqual(
      fail('validation', { fieldErrors: { role: 'invalid_choice' } }),
    );
    expectNothingChanged();
  });

  it('is a success that changes and audits nothing when the role is unchanged', async () => {
    expect(await changeUserRoleAction(null, form({ ...valid, role: 'faculty' }))).toEqual(
      ok(undefined),
    );
    expectNothingChanged();
  });

  it('does not audit when a concurrent change already set the same role', async () => {
    mocks.setRole.mockResolvedValue({ from: 'student_affairs', to: 'student_affairs' });
    expect(await changeUserRoleAction(null, form(valid))).toEqual(ok(undefined));
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers internal for an unexpected error and logs only its class and SQLSTATE', async () => {
    mocks.setRole.mockRejectedValue(
      Object.assign(new Error(`failed for ${TARGET_EMAIL} ${TARGET_NAME}`), { code: '40001' }),
    );
    expect(await changeUserRoleAction(null, form(valid))).toEqual(fail('internal'));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.user_role_change_failed', {
      errorName: 'Error',
      sqlState: '40001',
    });
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    expect(loggedText()).not.toContain(TARGET_NAME);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('setUserStatusAction', () => {
  const suspend = { userId: TARGET_ID, status: 'suspended' };
  const reactivate = { userId: TARGET_ID, status: 'active' };

  it('suspends, audits, then ends every session of the account', async () => {
    expect(await setUserStatusAction(null, form(suspend))).toEqual(ok(undefined));

    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.users.manage');
    expect(mocks.setStatus).toHaveBeenCalledExactlyOnceWith(TENANT_ID, TARGET_ID, 'suspended');
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(CTX, {
      action: 'user.suspended',
      targetId: TARGET_ID,
    });
    expect(mocks.revokeAllForUser).toHaveBeenCalledExactlyOnceWith(TARGET_ID);
    // The sessions end after the status change, so a sign-in racing with it cannot keep one.
    expect(mocks.setStatus.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revokeAllForUser.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.log.info).toHaveBeenCalledWith('admin.user_sessions_revoked', { count: 2 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/admin/users');
  });

  it('reactivates and audits without touching sessions', async () => {
    mocks.findInTenant.mockResolvedValue(target({ status: 'suspended' }));
    expect(await setUserStatusAction(null, form(reactivate))).toEqual(ok(undefined));

    expect(mocks.setStatus).toHaveBeenCalledExactlyOnceWith(TENANT_ID, TARGET_ID, 'active');
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(CTX, {
      action: 'user.reactivated',
      targetId: TARGET_ID,
    });
    expect(mocks.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('ends the sessions again, without a second audit row, for an account already suspended', async () => {
    mocks.findInTenant.mockResolvedValue(target({ status: 'suspended' }));
    expect(await setUserStatusAction(null, form(suspend))).toEqual(ok(undefined));

    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revokeAllForUser).toHaveBeenCalledExactlyOnceWith(TARGET_ID);
  });

  it('changes nothing when reactivating an active account', async () => {
    expect(await setUserStatusAction(null, form(reactivate))).toEqual(ok(undefined));
    expectNothingChanged();
  });

  it('returns the guard’s refusal before reading the form', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('unauthenticated') });
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('unauthenticated'));
    expect(mocks.findInTenant).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it('refuses the administrator’s own account with forbidden', async () => {
    expect(await setUserStatusAction(null, form({ ...suspend, userId: ADMIN_ID }))).toEqual(
      fail('forbidden'),
    );
    expectNothingChanged();
  });

  it('answers not_found for an account the college does not have, ending no session', async () => {
    mocks.findInTenant.mockResolvedValue(null);
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('not_found'));
    expectNothingChanged();
  });

  it('answers not_found when the account disappears before the change', async () => {
    mocks.setStatus.mockResolvedValue(false);
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('not_found'));
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('answers not_found for a missing hidden id and validation for an unknown status', async () => {
    expect(await setUserStatusAction(null, form({ status: 'suspended' }))).toEqual(
      fail('not_found'),
    );
    expect(await setUserStatusAction(null, form({ ...suspend, status: 'deleted' }))).toEqual(
      fail('validation', { fieldErrors: { status: 'invalid_choice' } }),
    );
    expectNothingChanged();
  });

  it('answers internal when ending the sessions fails, logs no personal data, and revalidates', async () => {
    mocks.revokeAllForUser.mockRejectedValue(new Error(`sessions of ${TARGET_EMAIL}`));
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('internal'));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.user_status_change_failed', {
      errorName: 'Error',
      sqlState: null,
    });
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    // The status did change: the list is refreshed so it shows it.
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
  });
});
