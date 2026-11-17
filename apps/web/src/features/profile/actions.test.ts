import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import {
  completeStudentProfileAction,
  setLocaleAction,
  updateAccountAction,
  updateStudentProfileAction,
} from './actions';

// Profile actions (contracts/server-actions.md §5.1): the branches the e2e tests cannot reach.
// Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  setLocale: vi.fn(),
  setName: vi.fn(),
  updateProfile: vi.fn(),
  revalidatePath: vi.fn(),
  findDivision: vi.fn(),
  createProfile: vi.fn(),
  findProfile: vi.fn(),
  withTenant: vi.fn(),
  recordAudit: vi.fn(),
  getActionContext: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT');
  }
}

vi.mock('@masari/db', () => ({
  users: { setLocale: mocks.setLocale, setName: mocks.setName },
  divisions: { findById: mocks.findDivision },
  studentProfiles: {
    create: mocks.createProfile,
    findByUserId: mocks.findProfile,
    update: mocks.updateProfile,
  },
  withTenant: mocks.withTenant,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectSignal) throw error;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en') }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

const USER_ID = 'user'.repeat(4);
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DIVISION_ID = '22222222-2222-4222-8222-222222222222';
const TX = { fake: 'tx' };

function signedIn(locale: 'ar' | 'en') {
  return {
    ctx: {
      user: { id: USER_ID, name: 'Test', email: 'test@example.edu', role: 'student', locale },
      tenant: { id: TENANT_ID, levelsCount: 4 },
      studentProfile: null,
    },
  };
}

beforeEach(() => {
  mocks.getActionContext.mockResolvedValue(signedIn('ar'));
  mocks.setLocale.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('setLocaleAction', () => {
  it('stores a new language for the signed-in user', async () => {
    expect(await setLocaleAction('en')).toEqual(ok(undefined));
    expect(mocks.getActionContext).toHaveBeenCalledWith();
    expect(mocks.setLocale).toHaveBeenCalledExactlyOnceWith(USER_ID, 'en');
  });

  it('does not write when the language is already the stored one', async () => {
    mocks.getActionContext.mockResolvedValue(signedIn('en'));
    expect(await setLocaleAction('en')).toEqual(ok(undefined));
    expect(mocks.setLocale).not.toHaveBeenCalled();
  });

  it('answers unauthenticated without a session and writes nothing', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('unauthenticated') });
    expect(await setLocaleAction('en')).toEqual(fail('unauthenticated'));
    expect(mocks.setLocale).not.toHaveBeenCalled();
  });

  it.each([['fr'], [''], ['EN'], [null], [42], [{ locale: 'en' }]])(
    'refuses %j as a language',
    async (value) => {
      expect(await setLocaleAction(value)).toEqual(
        fail('validation', { fieldErrors: { locale: 'invalid_choice' } }),
      );
      expect(mocks.setLocale).not.toHaveBeenCalled();
    },
  );

  it('answers internal and logs only the error class when the write fails', async () => {
    mocks.setLocale.mockRejectedValue(new TypeError('connection lost for test@example.edu'));
    expect(await setLocaleAction('en')).toEqual(fail('internal'));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.set_locale_failed', {
      errorName: 'TypeError',
    });
  });
});

describe('completeStudentProfileAction', () => {
  const CODE = 'CS-2024-001';

  function form(entries: Record<string, string> = {}): FormData {
    const data = new FormData();
    const all = { studentCode: CODE, level: '3', divisionId: DIVISION_ID, ...entries };
    for (const [key, value] of Object.entries(all)) data.append(key, value);
    return data;
  }

  async function submit(data: FormData = form()): Promise<unknown> {
    try {
      return await completeStudentProfileAction(null, data);
    } catch (error) {
      if (error instanceof RedirectSignal) return { redirect: error.url };
      throw error;
    }
  }

  /** The echo of the submitted fields that every failure carries. */
  function entered(entries: Record<string, string> = {}) {
    return { studentCode: CODE, level: '3', divisionId: DIVISION_ID, ...entries };
  }

  beforeEach(() => {
    mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(TX),
    );
    mocks.findProfile.mockResolvedValue(null);
    mocks.findDivision.mockResolvedValue({ id: DIVISION_ID, isActive: true });
    mocks.createProfile.mockImplementation((_tx: unknown, input: Record<string, unknown>) =>
      Promise.resolve({ ok: true, value: { ...input, tenantId: TENANT_ID } }),
    );
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it('creates the profile and its audit row in one college transaction, then goes to the dashboard', async () => {
    expect(await submit(form({ studentCode: ` ${CODE} `, role: 'admin' }))).toEqual({
      redirect: '/en/dashboard',
    });
    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('profile.academic.manage_own');
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.any(Function),
    );
    expect(mocks.findProfile).toHaveBeenCalledExactlyOnceWith(TX, USER_ID);
    expect(mocks.findDivision).toHaveBeenCalledExactlyOnceWith(TX, DIVISION_ID);
    expect(mocks.createProfile).toHaveBeenCalledExactlyOnceWith(TX, {
      userId: USER_ID,
      studentCode: CODE,
      level: 3,
      divisionId: DIVISION_ID,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      signedIn('ar').ctx,
      { action: 'profile.created', targetId: USER_ID },
      TX,
    );
  });

  it('goes to the dashboard when the profile already exists (double submit), writing nothing', async () => {
    mocks.findProfile.mockResolvedValue({ userId: USER_ID, studentCode: 'OTHER-1' });
    // Even a resubmitted form that would no longer validate.
    expect(await submit(form({ studentCode: 'a b', level: '0' }))).toEqual({
      redirect: '/en/dashboard',
    });
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers forbidden for a role without the permission and touches nothing', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await submit()).toEqual(fail('forbidden'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers unauthenticated without a session', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('unauthenticated') });
    expect(await submit()).toEqual(fail('unauthenticated'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('returns the field errors of the schema with the entered values', async () => {
    expect(await submit(form({ studentCode: 'a b', level: '0', divisionId: 'x' }))).toEqual(
      fail('validation', {
        fieldErrors: {
          studentCode: 'invalid_format',
          level: 'out_of_range',
          divisionId: 'invalid_choice',
        },
        meta: entered({ studentCode: 'a b', level: '0', divisionId: 'x' }),
      }),
    );
    expect(mocks.findDivision).not.toHaveBeenCalled();
    expect(mocks.createProfile).not.toHaveBeenCalled();
  });

  it("refuses a level above the college's number of levels", async () => {
    expect(await submit(form({ level: '5' }))).toEqual(
      fail('validation', {
        fieldErrors: { level: 'out_of_range' },
        meta: entered({ level: '5' }),
      }),
    );
    expect(mocks.findDivision).not.toHaveBeenCalled();
    expect(mocks.createProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown or of another college', null],
    ['inactive', { id: DIVISION_ID, isActive: false }],
  ])('refuses a division that is %s', async (_label, division) => {
    mocks.findDivision.mockResolvedValue(division);
    expect(await submit()).toEqual(
      fail('validation', { fieldErrors: { divisionId: 'invalid_choice' }, meta: entered() }),
    );
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it.each([
    [
      'student_code_taken',
      fail('validation', { fieldErrors: { studentCode: 'student_code_taken' }, meta: entered() }),
    ],
    [
      'invalid_division',
      fail('validation', { fieldErrors: { divisionId: 'invalid_choice' }, meta: entered() }),
    ],
    ['user_not_in_tenant', fail('forbidden', { meta: entered() })],
  ])('maps the repository refusal %s and writes no audit row', async (reason, expected) => {
    mocks.createProfile.mockResolvedValue({ ok: false, reason });
    expect(await submit()).toEqual(expected);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('treats already_exists from a concurrent submit as done: dashboard, no audit row', async () => {
    mocks.createProfile.mockResolvedValue({ ok: false, reason: 'already_exists' });
    expect(await submit()).toEqual({ redirect: '/en/dashboard' });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers internal and logs only the error class, never the student code', async () => {
    mocks.createProfile.mockRejectedValue(new RangeError(`duplicate ${CODE}`));
    expect(await submit()).toEqual(fail('internal', { meta: entered() }));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.complete_failed', {
      errorName: 'RangeError',
      sqlState: null,
    });
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(CODE);
  });

  it('logs the SQLSTATE of a database error, and nothing else from it', async () => {
    const error = Object.assign(new Error(`student_profiles.create failed`), {
      name: 'StudentProfileQueryError',
      code: '23514',
    });
    mocks.createProfile.mockRejectedValue(error);
    expect(await submit()).toEqual(fail('internal', { meta: entered() }));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.complete_failed', {
      errorName: 'StudentProfileQueryError',
      sqlState: '23514',
    });
  });

  it('never logs a code property that is not a SQLSTATE', async () => {
    mocks.createProfile.mockRejectedValue(Object.assign(new Error('x'), { code: CODE }));
    await submit();
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.complete_failed', {
      errorName: 'Error',
      sqlState: null,
    });
  });

  it('answers internal when the audit fails (the transaction rolls back)', async () => {
    mocks.recordAudit.mockRejectedValue(new Error('audit down'));
    expect(await submit()).toEqual(fail('internal', { meta: entered() }));
  });
});

/** The revalidations of a successful profile change: profile and dashboard, in both languages. */
const REVALIDATED = [['/ar/profile'], ['/ar/dashboard'], ['/en/profile'], ['/en/dashboard']];

function formOf(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe('updateAccountAction', () => {
  const NAME = 'Mona Ali';

  beforeEach(() => {
    mocks.setName.mockResolvedValue(undefined);
  });

  it('stores the trimmed new name and ignores every other field', async () => {
    const data = formOf({
      name: `  ${NAME} `,
      email: 'other@example.edu',
      role: 'admin',
      status: 'suspended',
    });
    expect(await updateAccountAction(null, data)).toEqual(ok(undefined));
    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.setName).toHaveBeenCalledExactlyOnceWith(USER_ID, NAME);
    expect(mocks.revalidatePath.mock.calls).toEqual(REVALIDATED);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('does not write when the name is unchanged', async () => {
    expect(await updateAccountAction(null, formOf({ name: 'Test' }))).toEqual(ok(undefined));
    expect(mocks.setName).not.toHaveBeenCalled();
  });

  it('returns the field error with the entered name, and writes nothing', async () => {
    expect(await updateAccountAction(null, formOf({ name: 'M', role: 'admin' }))).toEqual(
      fail('validation', { fieldErrors: { name: 'too_short' }, meta: { name: 'M' } }),
    );
    expect(mocks.setName).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('answers unauthenticated without a session and writes nothing', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('unauthenticated') });
    expect(await updateAccountAction(null, formOf({ name: NAME }))).toEqual(
      fail('unauthenticated'),
    );
    expect(mocks.setName).not.toHaveBeenCalled();
  });

  it('answers internal and never logs the name when the write fails', async () => {
    mocks.setName.mockRejectedValue(new TypeError(`cannot store ${NAME}`));
    expect(await updateAccountAction(null, formOf({ name: NAME }))).toEqual(
      fail('internal', { meta: { name: NAME } }),
    );
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.update_account_failed', {
      errorName: 'TypeError',
      sqlState: null,
    });
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(NAME);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateStudentProfileAction', () => {
  const CODE = 'CS-2024-001';
  const OTHER_DIVISION_ID = '33333333-3333-4333-8333-333333333333';
  const CURRENT = { userId: USER_ID, studentCode: CODE, level: 2, divisionId: DIVISION_ID };

  function form(entries: Record<string, string> = {}): FormData {
    return formOf({ level: '3', divisionId: OTHER_DIVISION_ID, ...entries });
  }

  /** The echo of the submitted level and division that every failure carries (never the code). */
  function entered(entries: Record<string, string> = {}) {
    return { level: '3', divisionId: OTHER_DIVISION_ID, ...entries };
  }

  beforeEach(() => {
    mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(TX),
    );
    mocks.findProfile.mockResolvedValue(CURRENT);
    mocks.findDivision.mockImplementation((_tx: unknown, id: string) =>
      Promise.resolve({ id, isActive: true }),
    );
    mocks.updateProfile.mockImplementation(
      (_tx: unknown, _userId: string, patch: Record<string, unknown>) =>
        Promise.resolve({ ok: true, value: { ...CURRENT, ...patch } }),
    );
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it('changes level and division in one college transaction, audits the fields, and ignores a forged code', async () => {
    const data = form({ studentCode: 'FORGED-1', role: 'admin', status: 'suspended' });
    expect(await updateStudentProfileAction(null, data)).toEqual(ok(undefined));
    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('profile.academic.manage_own');
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.any(Function),
    );
    expect(mocks.updateProfile).toHaveBeenCalledExactlyOnceWith(TX, USER_ID, {
      level: 3,
      divisionId: OTHER_DIVISION_ID,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      signedIn('ar').ctx,
      {
        action: 'profile.updated',
        targetId: USER_ID,
        metadata: { fields: ['level', 'divisionId'] },
      },
      TX,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual(REVALIDATED);
  });

  it('writes and audits only the field that changed', async () => {
    expect(await updateStudentProfileAction(null, form({ divisionId: DIVISION_ID }))).toEqual(
      ok(undefined),
    );
    expect(mocks.updateProfile).toHaveBeenCalledExactlyOnceWith(TX, USER_ID, { level: 3 });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: { fields: ['level'] } }),
      TX,
    );
  });

  it('is a success without a write or an audit row when nothing changed', async () => {
    expect(
      await updateStudentProfileAction(null, form({ level: '2', divisionId: DIVISION_ID })),
    ).toEqual(ok(undefined));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('keeps the current division even when it was deactivated', async () => {
    mocks.findDivision.mockResolvedValue({ id: DIVISION_ID, isActive: false });
    expect(await updateStudentProfileAction(null, form({ divisionId: DIVISION_ID }))).toEqual(
      ok(undefined),
    );
    expect(mocks.updateProfile).toHaveBeenCalledExactlyOnceWith(TX, USER_ID, { level: 3 });
  });

  it.each([
    ['unknown or of another college', null],
    ['inactive and not the current one', { id: OTHER_DIVISION_ID, isActive: false }],
  ])('refuses a division that is %s', async (_label, division) => {
    mocks.findDivision.mockResolvedValue(division);
    expect(await updateStudentProfileAction(null, form())).toEqual(
      fail('validation', { fieldErrors: { divisionId: 'invalid_choice' }, meta: entered() }),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a level above the college's number of levels", async () => {
    expect(await updateStudentProfileAction(null, form({ level: '5' }))).toEqual(
      fail('validation', { fieldErrors: { level: 'out_of_range' }, meta: entered({ level: '5' }) }),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('returns the schema errors with the entered level and division, never a forged code', async () => {
    const data = form({ level: '', divisionId: 'x', studentCode: 'FORGED-1' });
    expect(await updateStudentProfileAction(null, data)).toEqual(
      fail('validation', {
        fieldErrors: { level: 'required', divisionId: 'invalid_choice' },
        meta: entered({ level: '', divisionId: 'x' }),
      }),
    );
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers not_found when the student has no profile', async () => {
    mocks.findProfile.mockResolvedValue(null);
    expect(await updateStudentProfileAction(null, form())).toEqual(
      fail('not_found', { meta: entered() }),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', fail('not_found', { meta: entered() })],
    [
      'invalid_division',
      fail('validation', { fieldErrors: { divisionId: 'invalid_choice' }, meta: entered() }),
    ],
    ['student_code_taken', fail('conflict', { meta: entered() })],
  ])('maps the repository refusal %s and writes no audit row', async (reason, expected) => {
    mocks.updateProfile.mockResolvedValue({ ok: false, reason });
    expect(await updateStudentProfileAction(null, form())).toEqual(expected);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('answers forbidden for a role without the permission and touches nothing', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await updateStudentProfileAction(null, form())).toEqual(fail('forbidden'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers internal and logs only the error class and SQLSTATE, never the code', async () => {
    mocks.updateProfile.mockRejectedValue(
      Object.assign(new Error(`update failed for ${CODE}`), {
        name: 'StudentProfileQueryError',
        code: '40001',
      }),
    );
    expect(await updateStudentProfileAction(null, form())).toEqual(
      fail('internal', { meta: entered() }),
    );
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.update_failed', {
      errorName: 'StudentProfileQueryError',
      sqlState: '40001',
    });
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(CODE);
  });

  it('answers internal when the audit fails (the transaction rolls back)', async () => {
    mocks.recordAudit.mockRejectedValue(new Error('audit down'));
    expect(await updateStudentProfileAction(null, form())).toEqual(
      fail('internal', { meta: entered() }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
