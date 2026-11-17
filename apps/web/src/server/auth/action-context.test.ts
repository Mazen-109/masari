import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionContext } from './session';
import { getActionContext } from './action-context';

const getSessionContext = vi.hoisted(() => vi.fn<() => Promise<SessionContext | null>>());

vi.mock('@/server/auth/session', () => ({ getSessionContext }));

const ctx = (role: SessionContext['user']['role']): SessionContext => ({
  user: { id: 'user'.repeat(4), name: 'Test', email: 'test@example.edu', role, locale: 'ar' },
  tenant: {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'demo',
    nameAr: 'تجريبي',
    nameEn: 'Demo',
    levelsCount: 4,
    enabledModules: [],
    allowedEmailDomains: [],
  },
});

afterEach(() => {
  getSessionContext.mockReset();
});

describe('getActionContext', () => {
  it('fails with unauthenticated without a usable session', async () => {
    getSessionContext.mockResolvedValue(null);
    await expect(getActionContext()).resolves.toEqual({
      failure: { ok: false, code: 'unauthenticated' },
    });
    await expect(getActionContext('admin.users.manage')).resolves.toEqual({
      failure: { ok: false, code: 'unauthenticated' },
    });
  });

  it('grants any signed-in user when no permission is asked', async () => {
    const student = ctx('student');
    getSessionContext.mockResolvedValue(student);
    await expect(getActionContext()).resolves.toEqual({ ctx: student });
  });

  it('fails with forbidden when the role lacks the permission', async () => {
    getSessionContext.mockResolvedValue(ctx('student'));
    await expect(getActionContext('admin.users.manage')).resolves.toEqual({
      failure: { ok: false, code: 'forbidden' },
    });
  });

  it('returns the context when the role holds the permission', async () => {
    const admin = ctx('admin');
    getSessionContext.mockResolvedValue(admin);
    await expect(getActionContext('admin.users.manage')).resolves.toEqual({ ctx: admin });
  });
});
