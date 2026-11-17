import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { completeStudentProfileAction, setLocaleAction } from './actions';

// Profile actions (contracts/server-actions.md §5.1): the branches the e2e tests cannot reach.
// Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  setLocale: vi.fn(),
  findDivision: vi.fn(),
  createProfile: vi.fn(),
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
  users: { setLocale: mocks.setLocale },
  divisions: { findById: mocks.findDivision },
  studentProfiles: { create: mocks.createProfile },
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
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("refuses a level above the college's number of levels", async () => {
    expect(await submit(form({ level: '5' }))).toEqual(
      fail('validation', {
        fieldErrors: { level: 'out_of_range' },
        meta: entered({ level: '5' }),
      }),
    );
    expect(mocks.withTenant).not.toHaveBeenCalled();
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
    ['already_exists', fail('conflict', { meta: entered() })],
    ['user_not_in_tenant', fail('forbidden', { meta: entered() })],
  ])('maps the repository refusal %s and writes no audit row', async (reason, expected) => {
    mocks.createProfile.mockResolvedValue({ ok: false, reason });
    expect(await submit()).toEqual(expected);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers internal and logs only the error class, never the student code', async () => {
    mocks.createProfile.mockRejectedValue(new RangeError(`duplicate ${CODE}`));
    expect(await submit()).toEqual(fail('internal', { meta: entered() }));
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('profile.complete_failed', {
      errorName: 'RangeError',
    });
    expect(JSON.stringify(mocks.log.error.mock.calls)).not.toContain(CODE);
  });

  it('answers internal when the audit fails (the transaction rolls back)', async () => {
    mocks.recordAudit.mockRejectedValue(new Error('audit down'));
    expect(await submit()).toEqual(fail('internal', { meta: entered() }));
  });
});
