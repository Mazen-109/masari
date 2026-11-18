import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { updateTenantSettingsAction } from './actions';

// contracts/server-actions.md §5.4 (FR-032, FR-034, FR-044): guard → validate → in one transaction lock
// the college, check the levels in use, write only what changed, audit it; and what is (never) logged.
// Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  findCurrentForUpdate: vi.fn(),
  updateSettings: vi.fn(),
  maxLevelInUse: vi.fn(),
  withTenant: vi.fn(),
  recordAudit: vi.fn(),
  getActionContext: vi.fn(),
  revalidatePath: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({
  MODULE_KEYS: ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'],
  tenants: {
    findCurrentForUpdate: mocks.findCurrentForUpdate,
    updateSettings: mocks.updateSettings,
  },
  studentProfiles: { maxLevelInUse: mocks.maxLevelInUse },
  withTenant: mocks.withTenant,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = 'admn'.repeat(4);
const NAME_AR = 'كلية الحاسبات';
const NAME_EN = 'Faculty of Computing';
const CTX = {
  user: { id: ADMIN_ID, name: 'Admin', email: 'admin@college.example', role: 'admin' },
  tenant: { id: TENANT_ID, nameAr: NAME_AR, nameEn: NAME_EN, levelsCount: 4 },
  studentProfile: null,
};
const TX = { tx: true };
const ALL = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'];

const STORED = {
  id: TENANT_ID,
  slug: 'fci',
  status: 'active',
  nameAr: NAME_AR,
  nameEn: NAME_EN,
  allowedEmailDomains: ['fci.example.edu'],
  levelsCount: 4,
  enabledModules: ALL,
};

type Entries = {
  nameAr?: string;
  nameEn?: string;
  allowedEmailDomains?: string;
  levelsCount?: string;
  enabledModules?: string[];
  [extra: string]: string | string[] | undefined;
};

const UNCHANGED: Entries = {
  nameAr: NAME_AR,
  nameEn: NAME_EN,
  allowedEmailDomains: 'fci.example.edu',
  levelsCount: '4',
  enabledModules: ALL,
};

function form(entries: Entries): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

function loggedText(): string {
  return JSON.stringify([
    ...mocks.log.info.mock.calls,
    ...mocks.log.warn.mock.calls,
    ...mocks.log.error.mock.calls,
  ]);
}

beforeEach(() => {
  mocks.getActionContext.mockResolvedValue({ ctx: CTX });
  mocks.withTenant.mockImplementation((_context: unknown, run: (tx: unknown) => unknown) =>
    run(TX),
  );
  mocks.findCurrentForUpdate.mockResolvedValue(STORED);
  mocks.updateSettings.mockResolvedValue(STORED);
  mocks.maxLevelInUse.mockResolvedValue(3);
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('updateTenantSettingsAction', () => {
  it('writes only the changed settings in one transaction and audits their names', async () => {
    const entries = {
      ...UNCHANGED,
      nameEn: 'Faculty of Computers',
      allowedEmailDomains: 'FCI.example.edu\nexample.edu',
      levelsCount: '5',
    };
    expect(await updateTenantSettingsAction(null, form(entries))).toEqual(ok(undefined));

    expect(mocks.getActionContext).toHaveBeenCalledExactlyOnceWith('admin.settings.manage');
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: ADMIN_ID },
      expect.any(Function),
    );
    expect(mocks.findCurrentForUpdate).toHaveBeenCalledExactlyOnceWith(TX);
    expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(TX, {
      nameAr: undefined,
      nameEn: 'Faculty of Computers',
      allowedEmailDomains: ['fci.example.edu', 'example.edu'],
      levelsCount: 5,
      enabledModules: undefined,
    });
    // More levels never needs the levels in use.
    expect(mocks.maxLevelInUse).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      {
        action: 'tenant.settings_updated',
        targetId: TENANT_ID,
        metadata: { fields: ['nameEn', 'allowedEmailDomains', 'levelsCount'] },
      },
      TX,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith('/', 'layout');
  });

  it('audits a module change on its own, with the enabled modules in registry order', async () => {
    const entries = { ...UNCHANGED, enabledModules: ['tadreeb', 'mueed'] };
    expect(await updateTenantSettingsAction(null, form(entries))).toEqual(ok(undefined));
    expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith(TX, {
      nameAr: undefined,
      nameEn: undefined,
      allowedEmailDomains: undefined,
      levelsCount: undefined,
      enabledModules: ['mueed', 'tadreeb'],
    });
    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(
      CTX,
      {
        action: 'tenant.modules_updated',
        targetId: TENANT_ID,
        metadata: { enabled: ['mueed', 'tadreeb'] },
      },
      TX,
    );
  });

  it('writes both audit rows when names and modules change together, and accepts no modules', async () => {
    const entries = { ...UNCHANGED, nameAr: 'كلية الحاسبات والمعلومات', enabledModules: [] };
    expect(await updateTenantSettingsAction(null, form(entries))).toEqual(ok(undefined));
    expect(mocks.recordAudit.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { action: 'tenant.settings_updated', targetId: TENANT_ID, metadata: { fields: ['nameAr'] } },
      { action: 'tenant.modules_updated', targetId: TENANT_ID, metadata: { enabled: [] } },
    ]);
  });

  it('is a success that writes and audits nothing when nothing changed', async () => {
    expect(await updateTenantSettingsAction(null, form(UNCHANGED))).toEqual(ok(undefined));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('refuses fewer levels than the highest level in use, naming it, and changes nothing', async () => {
    const entries = { ...UNCHANGED, nameEn: 'Renamed', levelsCount: '2' };
    const result = await updateTenantSettingsAction(null, form(entries));
    expect(result).toEqual(
      fail('validation', {
        fieldErrors: { levelsCount: 'levels_in_use' },
        meta: {
          min: 3,
          nameAr: NAME_AR,
          nameEn: 'Renamed',
          allowedEmailDomains: 'fci.example.edu',
          levelsCount: '2',
          enabledModules: ALL.join(','),
        },
      }),
    );
    expect(mocks.maxLevelInUse).toHaveBeenCalledExactlyOnceWith(TX);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('allows fewer levels down to the highest level in use', async () => {
    const result = await updateTenantSettingsAction(null, form({ ...UNCHANGED, levelsCount: '3' }));
    expect(result).toEqual(ok(undefined));
    expect(mocks.updateSettings.mock.calls[0]?.[1]).toMatchObject({ levelsCount: 3 });
  });

  it('refuses invalid fields before any transaction, echoing the entered values and known modules only', async () => {
    const entries = {
      ...UNCHANGED,
      nameAr: '',
      allowedEmailDomains: 'example.edu\nnot a domain',
      enabledModules: ['mueed', 'payments'],
      slug: 'hijack',
    };
    const result = await updateTenantSettingsAction(null, form(entries));
    expect(result).toEqual(
      fail('validation', {
        fieldErrors: {
          nameAr: 'required',
          allowedEmailDomains: 'invalid_format',
          enabledModules: 'invalid_choice',
        },
        meta: {
          nameAr: '',
          nameEn: NAME_EN,
          allowedEmailDomains: 'example.edu\nnot a domain',
          levelsCount: '4',
          enabledModules: 'mueed',
        },
      }),
    );
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('returns the guard’s refusal before reading the form', async () => {
    mocks.getActionContext.mockResolvedValue({ failure: fail('forbidden') });
    expect(await updateTenantSettingsAction(null, form(UNCHANGED))).toEqual(fail('forbidden'));
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('answers internal for an unexpected error, logging only its class and SQLSTATE', async () => {
    mocks.updateSettings.mockRejectedValue(
      Object.assign(new Error(`check failed for ${NAME_EN} and evil.example.edu`), {
        code: '23514',
      }),
    );
    const entries = { ...UNCHANGED, nameEn: 'Faculty of Computers', allowedEmailDomains: '' };
    const result = await updateTenantSettingsAction(null, form(entries));
    expect(result.ok === false && result.code).toBe('internal');
    expect(mocks.log.error).toHaveBeenCalledExactlyOnceWith('tenant.settings_update_failed', {
      errorName: 'Error',
      sqlState: '23514',
    });
    expect(loggedText()).not.toContain(NAME_EN);
    expect(loggedText()).not.toContain('evil.example.edu');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('answers not_found when the context names no college', async () => {
    mocks.findCurrentForUpdate.mockResolvedValue(null);
    const result = await updateTenantSettingsAction(null, form(UNCHANGED));
    expect(result.ok === false && result.code).toBe('not_found');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
