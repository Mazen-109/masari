import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import {
  adminUpdateStudentProfileAction,
  changeUserRoleAction,
  setUserStatusAction,
} from './actions';

// The People screen's row actions (contracts/server-actions.md §5.3): the order of the steps, the no-op
// and race branches the e2e tests cannot reach, the session revocation on suspend, and what is (never)
// logged. Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  findInTenant: vi.fn(),
  lockRoleInTenant: vi.fn(),
  setRole: vi.fn(),
  setStatus: vi.fn(),
  revokeAllForUser: vi.fn(),
  recordAudit: vi.fn(),
  withTenant: vi.fn(),
  findProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  findDivision: vi.fn(),
  findCurrentTenantForShare: vi.fn(),
  getActionContext: vi.fn(),
  revalidatePath: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({
  ROLES: ['student', 'faculty', 'student_affairs', 'admin'],
  USER_STATUSES: ['active', 'suspended'],
  users: {
    findInTenant: mocks.findInTenant,
    lockRoleInTenant: mocks.lockRoleInTenant,
    setRole: mocks.setRole,
    setStatus: mocks.setStatus,
  },
  sessions: { revokeAllForUser: mocks.revokeAllForUser },
  withTenant: mocks.withTenant,
  studentProfiles: {
    findByUserId: mocks.findProfile,
    create: mocks.createProfile,
    update: mocks.updateProfile,
  },
  divisions: { findById: mocks.findDivision },
  tenants: { findCurrentForShare: mocks.findCurrentTenantForShare },
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
  tenant: { id: TENANT_ID, nameAr: 'كلية التجربة', nameEn: 'Trial College', levelsCount: 4 },
  studentProfile: null,
};

/** The transaction handed to the withTenant callback. */
const TX = { tx: true };

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
  mocks.withTenant.mockImplementation((_context: unknown, run: (tx: unknown) => unknown) =>
    run(TX),
  );
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

  it('answers forbidden, without an audit row, when the target is the last active administrator', async () => {
    mocks.findInTenant.mockResolvedValue(target({ role: 'admin' }));
    mocks.setRole.mockResolvedValue('last_admin');
    expect(await changeUserRoleAction(null, form({ ...valid, role: 'faculty' }))).toEqual(
      fail('forbidden'),
    );
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

  it('answers internal when the audit row fails after the change, logging its class and SQLSTATE only', async () => {
    // A driver error wrapped as `cause`, as the audit repository may throw it.
    mocks.recordAudit.mockRejectedValue(
      Object.assign(new TypeError(`audit for ${TARGET_EMAIL}`), {
        cause: { code: '23514', detail: TARGET_EMAIL },
      }),
    );
    expect(await changeUserRoleAction(null, form(valid))).toEqual(fail('internal'));
    expect(mocks.setRole).toHaveBeenCalledOnce();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.user_audit_failed', {
      errorName: 'TypeError',
      sqlState: '23514',
    });
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    // The role did change: the list is refreshed so it shows it.
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
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
  });
});

describe('setUserStatusAction', () => {
  const suspend = { userId: TARGET_ID, status: 'suspended' };
  const reactivate = { userId: TARGET_ID, status: 'active' };

  it('suspends, ends every session of the account, then audits', async () => {
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
    // … and before the audit row, so they end even when it cannot be written.
    expect(mocks.revokeAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordAudit.mock.invocationCallOrder[0] ?? 0,
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

  it('answers forbidden for the last active administrator, ending no session and auditing nothing', async () => {
    mocks.findInTenant.mockResolvedValue(target({ role: 'admin' }));
    mocks.setStatus.mockResolvedValue('last_admin');
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('forbidden'));
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

  it('still ends the sessions when the audit row fails, logging its class and SQLSTATE only', async () => {
    mocks.recordAudit.mockRejectedValue(new Error(`audit for ${TARGET_EMAIL}`));
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('internal'));
    expect(mocks.setStatus).toHaveBeenCalledOnce();
    expect(mocks.revokeAllForUser).toHaveBeenCalledExactlyOnceWith(TARGET_ID);
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.user_audit_failed', {
      errorName: 'Error',
      sqlState: null,
    });
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
  });

  it('answers internal when ending the sessions fails, logs no personal data, and revalidates', async () => {
    mocks.revokeAllForUser.mockRejectedValue(new Error(`sessions of ${TARGET_EMAIL}`));
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('internal'));
    // The status did change, so it is still audited: a retry finds it unchanged and would not audit it.
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(CTX, {
      action: 'user.suspended',
      targetId: TARGET_ID,
    });
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.user_status_change_failed', {
      errorName: 'Error',
      sqlState: null,
    });
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    // The status did change: the list is refreshed so it shows it.
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ar/admin/users');
  });

  it('logs both failures when ending the sessions and the audit row both fail', async () => {
    mocks.revokeAllForUser.mockRejectedValue(new Error(`sessions of ${TARGET_EMAIL}`));
    mocks.recordAudit.mockRejectedValue(new Error(`audit for ${TARGET_EMAIL}`));
    expect(await setUserStatusAction(null, form(suspend))).toEqual(fail('internal'));
    expect(mocks.log.error.mock.calls).toEqual([
      ['admin.user_audit_failed', { errorName: 'Error', sqlState: null }],
      ['admin.user_status_change_failed', { errorName: 'Error', sqlState: null }],
    ]);
    expect(loggedText()).not.toContain(TARGET_EMAIL);
  });
});

describe('adminUpdateStudentProfileAction', () => {
  const DIVISION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const DIVISION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const CODE = 'CS-2026-07';
  const valid = { userId: TARGET_ID, studentCode: CODE, level: '3', divisionId: DIVISION_B };
  const current = { userId: TARGET_ID, studentCode: CODE, level: 2, divisionId: DIVISION_A };

  beforeEach(() => {
    mocks.findInTenant.mockResolvedValue(target({ role: 'student' }));
    mocks.lockRoleInTenant.mockResolvedValue('student');
    mocks.findProfile.mockResolvedValue(current);
    mocks.findDivision.mockImplementation((_tx: unknown, id: string) =>
      Promise.resolve({ id, isActive: id === DIVISION_B }),
    );
    mocks.createProfile.mockResolvedValue({ ok: true, value: {} });
    mocks.updateProfile.mockResolvedValue({ ok: true, value: {} });
    mocks.findCurrentTenantForShare.mockResolvedValue({ id: TENANT_ID, levelsCount: 4 });
  });

  function expectNoProfileWrite(): void {
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  }

  it('changes only the differing fields in one transaction as the administrator, audited with their names', async () => {
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toEqual(ok(undefined));

    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.users.manage');
    expect(mocks.findInTenant).toHaveBeenCalledExactlyOnceWith(TENANT_ID, TARGET_ID);
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: ADMIN_ID },
      expect.any(Function),
    );
    expect(mocks.updateProfile).toHaveBeenCalledExactlyOnceWith(TX, TARGET_ID, {
      level: 3,
      divisionId: DIVISION_B,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      {
        action: 'profile.updated',
        targetId: TARGET_ID,
        metadata: { fields: ['level', 'divisionId'] },
      },
      TX,
    );
    for (const path of ['admin/users', 'dashboard', 'profile']) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/ar/${path}`);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en/${path}`);
    }
  });

  it('corrects the student code, unlike the student’s own form', async () => {
    const result = await adminUpdateStudentProfileAction(
      null,
      form({ ...valid, studentCode: 'CS-2026-08', level: '2', divisionId: DIVISION_A }),
    );
    expect(result).toEqual(ok(undefined));
    expect(mocks.updateProfile).toHaveBeenCalledExactlyOnceWith(TX, TARGET_ID, {
      studentCode: 'CS-2026-08',
    });
    expect(mocks.recordAudit.mock.calls[0]?.[1]).toEqual({
      action: 'profile.updated',
      targetId: TARGET_ID,
      metadata: { fields: ['studentCode'] },
    });
  });

  it('keeps the student’s deactivated division, and writes nothing when nothing differs', async () => {
    const same = { ...valid, level: '2', divisionId: DIVISION_A };
    expect(await adminUpdateStudentProfileAction(null, form(same))).toEqual(ok(undefined));
    expectNoProfileWrite();
  });

  it('creates a missing profile with an active division, audited as profile.created', async () => {
    mocks.findProfile.mockResolvedValue(null);
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toEqual(ok(undefined));
    expect(mocks.createProfile).toHaveBeenCalledExactlyOnceWith(TX, {
      userId: TARGET_ID,
      studentCode: CODE,
      level: 3,
      divisionId: DIVISION_B,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      { action: 'profile.created', targetId: TARGET_ID },
      TX,
    );
  });

  it.each([
    ['a staff account', target({ role: 'faculty' })],
    ['an account of another college or an unknown id', null],
  ])('answers not_found for %s, before any transaction', async (_label, account) => {
    mocks.findInTenant.mockResolvedValue(account);
    const result = await adminUpdateStudentProfileAction(null, form(valid));
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('re-reads the role in the transaction: an account no longer a student is not_found, nothing written', async () => {
    mocks.lockRoleInTenant.mockResolvedValue('faculty');
    const result = await adminUpdateStudentProfileAction(null, form(valid));
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.lockRoleInTenant).toHaveBeenCalledExactlyOnceWith(TX, TENANT_ID, TARGET_ID);
    expect(mocks.findProfile).not.toHaveBeenCalled();
    expectNoProfileWrite();
    mocks.lockRoleInTenant.mockResolvedValue(null);
    const gone = await adminUpdateStudentProfileAction(null, form(valid));
    expect(gone.ok === false && gone.code).toBe('not_found');
    expectNoProfileWrite();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('answers not_found for a missing hidden id', async () => {
    const result = await adminUpdateStudentProfileAction(
      null,
      form({ ...valid, userId: undefined }),
    );
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.findInTenant).not.toHaveBeenCalled();
  });

  it('refuses invalid fields with the student form’s codes and echoes the entered values only', async () => {
    const result = await adminUpdateStudentProfileAction(
      null,
      form({ ...valid, studentCode: 'ab', role: 'admin' }),
    );
    expect(result).toEqual(
      fail('validation', {
        fieldErrors: { studentCode: 'invalid_format' },
        meta: { studentCode: 'ab', level: '3', divisionId: DIVISION_B },
      }),
    );
    expect(mocks.findInTenant).not.toHaveBeenCalled();
  });

  it('applies the college’s rules: levels above its number, an inactive or unknown division', async () => {
    expect(
      await adminUpdateStudentProfileAction(null, form({ ...valid, level: '5' })),
    ).toMatchObject({ ok: false, code: 'validation', fieldErrors: { level: 'out_of_range' } });
    mocks.findDivision.mockResolvedValue({ id: DIVISION_B, isActive: false });
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toMatchObject({
      ok: false,
      code: 'validation',
      fieldErrors: { divisionId: 'invalid_choice' },
    });
    mocks.findDivision.mockResolvedValue(null);
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toMatchObject({
      fieldErrors: { divisionId: 'invalid_choice' },
    });
    expectNoProfileWrite();
  });

  it('checks the level against the college row locked in the transaction, not the session copy', async () => {
    // The session still says 4 levels; a settings save has just lowered it to 2.
    mocks.findCurrentTenantForShare.mockResolvedValue({ id: TENANT_ID, levelsCount: 2 });
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toMatchObject({
      ok: false,
      code: 'validation',
      fieldErrors: { level: 'out_of_range' },
    });
    expect(mocks.findCurrentTenantForShare).toHaveBeenCalledExactlyOnceWith(TX);
    expectNoProfileWrite();
  });

  it.each(['update', 'create'] as const)(
    'answers student_code_taken when the %s hits a code in use, without an audit row',
    async (step) => {
      const taken = { ok: false, reason: 'student_code_taken' };
      if (step === 'create') {
        mocks.findProfile.mockResolvedValue(null);
        mocks.createProfile.mockResolvedValue(taken);
      } else {
        mocks.updateProfile.mockResolvedValue(taken);
      }
      const result = await adminUpdateStudentProfileAction(
        null,
        form({ ...valid, studentCode: 'CS-TAKEN' }),
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'validation',
        fieldErrors: { studentCode: 'student_code_taken' },
      });
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    },
  );

  it('answers conflict when the student created the profile at the same moment', async () => {
    mocks.findProfile.mockResolvedValue(null);
    mocks.createProfile.mockResolvedValue({ ok: false, reason: 'already_exists' });
    const result = await adminUpdateStudentProfileAction(null, form(valid));
    expect(result.ok === false && result.code).toBe('conflict');
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers internal for an unexpected error, never logging the student code', async () => {
    mocks.updateProfile.mockRejectedValue(
      Object.assign(new Error(`duplicate ${CODE} for ${TARGET_EMAIL}`), { code: '40001' }),
    );
    const result = await adminUpdateStudentProfileAction(null, form(valid));
    expect(result.ok === false && result.code).toBe('internal');
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('admin.student_profile_update_failed', {
      errorName: 'Error',
      sqlState: '40001',
    });
    expect(loggedText()).not.toContain(CODE);
    expect(loggedText()).not.toContain(TARGET_EMAIL);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the guard’s refusal before reading the form', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await adminUpdateStudentProfileAction(null, form(valid))).toEqual(fail('forbidden'));
    expect(mocks.findInTenant).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });
});
