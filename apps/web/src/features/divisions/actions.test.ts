import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { createDivisionAction, setDivisionActiveAction, updateDivisionAction } from './actions';

// contracts/server-actions.md §5.5 (FR-033, FR-044): guard → validate → change and audit in one
// transaction; another college's or an unknown id → not_found; what is (never) logged. Every collaborator
// is mocked.

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  withTenant: vi.fn(),
  recordAudit: vi.fn(),
  getActionContext: vi.fn(),
  revalidatePath: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({
  divisions: {
    create: mocks.create,
    findById: mocks.findById,
    update: mocks.update,
    setActive: mocks.setActive,
  },
  withTenant: mocks.withTenant,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DIVISION_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = 'admn'.repeat(4);
const CTX = {
  user: { id: ADMIN_ID, name: 'Admin', email: 'admin@college.example', role: 'admin' },
  tenant: { id: TENANT_ID, levelsCount: 4 },
  studentProfile: null,
};
const TX = { tx: true };

const STORED = {
  id: DIVISION_ID,
  tenantId: TENANT_ID,
  code: 'SE',
  nameAr: 'هندسة البرمجيات',
  nameEn: 'Software Engineering',
  isActive: true,
  sortOrder: 2,
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function loggedText(): string {
  return JSON.stringify([
    ...mocks.log.info.mock.calls,
    ...mocks.log.warn.mock.calls,
    ...mocks.log.error.mock.calls,
  ]);
}

const NEW = {
  divisionCode: ' se ',
  nameAr: 'هندسة البرمجيات',
  nameEn: 'Software Engineering',
  sortOrder: '2',
};
const EDIT = {
  divisionId: DIVISION_ID,
  nameAr: STORED.nameAr,
  nameEn: STORED.nameEn,
  sortOrder: '2',
};

beforeEach(() => {
  mocks.getActionContext.mockResolvedValue({ ctx: CTX });
  mocks.withTenant.mockImplementation((_context: unknown, run: (tx: unknown) => unknown) =>
    run(TX),
  );
  mocks.create.mockResolvedValue({ ok: true, value: STORED });
  mocks.findById.mockResolvedValue(STORED);
  mocks.update.mockResolvedValue(STORED);
  mocks.setActive.mockResolvedValue(STORED);
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('createDivisionAction', () => {
  it('stores the upper-cased code in the caller’s college and audits division.created', async () => {
    expect(await createDivisionAction(null, form(NEW))).toEqual(ok(undefined));
    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.settings.manage');
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: ADMIN_ID },
      expect.any(Function),
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(TX, {
      code: 'SE',
      nameAr: STORED.nameAr,
      nameEn: STORED.nameEn,
      sortOrder: 2,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      { action: 'division.created', targetId: DIVISION_ID },
      TX,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/ar/admin/divisions'],
      ['/en/admin/divisions'],
    ]);
  });

  it('refuses a code the college already has with code_taken, echoing the entered values', async () => {
    mocks.create.mockResolvedValue({ ok: false, reason: 'code_taken' });
    expect(await createDivisionAction(null, form(NEW))).toEqual(
      fail('validation', { fieldErrors: { divisionCode: 'code_taken' }, meta: NEW }),
    );
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses invalid fields before any transaction', async () => {
    const result = await createDivisionAction(
      null,
      form({ ...NEW, divisionCode: 'S E', nameAr: '' }),
    );
    expect(result.ok === false && result.fieldErrors).toEqual({
      divisionCode: 'invalid_format',
      nameAr: 'required',
    });
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('returns the guard’s refusal before reading the form', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await createDivisionAction(null, form(NEW))).toEqual(fail('forbidden'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers internal for an unexpected error, logging only its class and SQLSTATE', async () => {
    mocks.create.mockRejectedValue(
      Object.assign(new Error(`check failed for ${NEW.nameEn} (SE)`), { code: '23514' }),
    );
    const result = await createDivisionAction(null, form(NEW));
    expect(result.ok === false && result.code).toBe('internal');
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('division.create_failed', {
      errorName: 'Error',
      sqlState: '23514',
    });
    expect(loggedText()).not.toContain(NEW.nameEn);
  });
});

describe('updateDivisionAction', () => {
  it('writes and audits only the changed fields, never the code', async () => {
    const entries = { ...EDIT, nameEn: 'Software Eng.', sortOrder: '0', divisionCode: 'HIJACK' };
    expect(await updateDivisionAction(null, form(entries))).toEqual(ok(undefined));
    expect(mocks.findById).toHaveBeenCalledExactlyOnceWith(TX, DIVISION_ID);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(TX, DIVISION_ID, {
      nameEn: 'Software Eng.',
      sortOrder: 0,
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      {
        action: 'division.updated',
        targetId: DIVISION_ID,
        metadata: { fields: ['nameEn', 'sortOrder'] },
      },
      TX,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it('is a success that writes and audits nothing when nothing changed', async () => {
    expect(await updateDivisionAction(null, form(EDIT))).toEqual(ok(undefined));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers not_found for an id the college does not have, and changes nothing', async () => {
    mocks.findById.mockResolvedValue(null);
    const result = await updateDivisionAction(null, form({ ...EDIT, nameEn: 'Changed' }));
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers not_found for a missing id', async () => {
    const withoutId = { nameAr: EDIT.nameAr, nameEn: EDIT.nameEn, sortOrder: EDIT.sortOrder };
    const result = await updateDivisionAction(null, form(withoutId));
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('reports invalid names on their fields', async () => {
    const result = await updateDivisionAction(null, form({ ...EDIT, nameAr: ' ' }));
    expect(result.ok === false && result.fieldErrors).toEqual({ nameAr: 'required' });
  });
});

describe('setDivisionActiveAction', () => {
  it('deactivates an active division and audits division.deactivated', async () => {
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'false' }),
    );
    expect(result).toEqual(ok(undefined));
    expect(mocks.setActive).toHaveBeenCalledExactlyOnceWith(TX, DIVISION_ID, false);
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      { action: 'division.deactivated', targetId: DIVISION_ID },
      TX,
    );
  });

  it('reactivates an inactive division and audits division.activated', async () => {
    mocks.findById.mockResolvedValue({ ...STORED, isActive: false });
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'true' }),
    );
    expect(result).toEqual(ok(undefined));
    expect(mocks.setActive).toHaveBeenCalledExactlyOnceWith(TX, DIVISION_ID, true);
    expect(mocks.recordAudit.mock.calls[0]?.[1]).toEqual({
      action: 'division.activated',
      targetId: DIVISION_ID,
    });
  });

  it('is a success without a write or an audit row when the state is unchanged', async () => {
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'true' }),
    );
    expect(result).toEqual(ok(undefined));
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers not_found for another college’s id, and changes nothing', async () => {
    mocks.findById.mockResolvedValue(null);
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'false' }),
    );
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses an isActive that is neither "true" nor "false"', async () => {
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'maybe' }),
    );
    expect(result.ok === false && result.fieldErrors).toEqual({ isActive: 'invalid_choice' });
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('returns the guard’s refusal', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    const result = await setDivisionActiveAction(
      null,
      form({ divisionId: DIVISION_ID, isActive: 'false' }),
    );
    expect(result).toEqual(fail('forbidden'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });
});
