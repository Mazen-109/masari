import type { Tenant, UserSummary } from '@masari/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSessionContext,
  getSessionDenialReason,
  requirePermission,
  requireSession,
  signInPath,
} from './session';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(),
  findUser: vi.fn<(id: string) => Promise<UserSummary | null>>(),
  findTenant: vi.fn<(id: string) => Promise<Tenant | null>>(),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT');
  }
}
class NotFoundSignal extends Error {}

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: <F>(fn: F) => fn,
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new NotFoundSignal();
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en') }));
vi.mock('@/server/auth/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock('@masari/db', async (original) => ({
  ...(await original<typeof import('@masari/db')>()),
  users: { findById: mocks.findUser },
  tenants: { findById: mocks.findTenant },
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user'.repeat(4);

const user: UserSummary = {
  id: USER_ID,
  tenantId: TENANT_ID,
  name: 'Test Student',
  email: 'student@example.edu',
  emailVerified: true,
  role: 'student',
  status: 'active',
  locale: 'ar',
  createdAt: new Date(0),
};

const tenant: Tenant = {
  id: TENANT_ID,
  slug: 'demo',
  nameAr: 'كلية تجريبية',
  nameEn: 'Demo College',
  status: 'active',
  allowedEmailDomains: ['example.edu'],
  levelsCount: 4,
  enabledModules: ['mueed', 'kitabi'],
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function arrange(
  over: {
    user?: Partial<UserSummary> | null;
    tenant?: Partial<Tenant> | null;
    session?: boolean;
  } = {},
) {
  mocks.getSession.mockResolvedValue(over.session === false ? null : { user: { id: USER_ID } });
  mocks.findUser.mockResolvedValue(over.user === null ? null : { ...user, ...over.user });
  mocks.findTenant.mockResolvedValue(over.tenant === null ? null : { ...tenant, ...over.tenant });
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RedirectSignal);
  return (error as RedirectSignal).url;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('getSessionContext', () => {
  it('builds the context from the fresh user and college rows only', async () => {
    arrange();
    await expect(getSessionContext()).resolves.toEqual({
      user: {
        id: USER_ID,
        name: 'Test Student',
        email: 'student@example.edu',
        role: 'student',
        locale: 'ar',
      },
      tenant: {
        id: TENANT_ID,
        slug: 'demo',
        nameAr: 'كلية تجريبية',
        nameEn: 'Demo College',
        levelsCount: 4,
        enabledModules: ['mueed', 'kitabi'],
        allowedEmailDomains: ['example.edu'],
      },
    });
    expect(mocks.findUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.findTenant).toHaveBeenCalledWith(TENANT_ID);
    await expect(getSessionDenialReason()).resolves.toBe('none');
  });

  it.each([
    ['no session', { session: false }, 'none'],
    ['the user row is gone', { user: null }, 'none'],
    ['the user is suspended', { user: { status: 'suspended' as const } }, 'account_suspended'],
    ['the college row is gone', { tenant: null }, 'none'],
    ['the college is suspended', { tenant: { status: 'suspended' as const } }, 'tenant_suspended'],
  ])('is null when %s (denial reason %s)', async (_name, over, reason) => {
    arrange(over);
    await expect(getSessionContext()).resolves.toBeNull();
    await expect(getSessionDenialReason()).resolves.toBe(reason);
  });

  it('takes the role from the database, not from the session', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: USER_ID } });
    mocks.findUser.mockResolvedValue({ ...user, role: 'admin' });
    mocks.findTenant.mockResolvedValue(tenant);
    expect((await getSessionContext())?.user.role).toBe('admin');
  });
});

describe('signInPath', () => {
  it('adds next and, when suspended, reason', () => {
    expect(signInPath('ar', '/dashboard?x=1', 'none')).toBe(
      '/ar/sign-in?next=%2Fdashboard%3Fx%3D1',
    );
    expect(signInPath('en', '/profile', 'tenant_suspended')).toBe(
      '/en/sign-in?next=%2Fprofile&reason=tenant_suspended',
    );
  });

  it('drops a returnTo that safeNext refuses', () => {
    expect(signInPath('ar', '//evil', 'none')).toBe('/ar/sign-in');
    expect(signInPath('ar', 'https://evil', 'account_suspended')).toBe(
      '/ar/sign-in?reason=account_suspended',
    );
  });
});

describe('requireSession', () => {
  it('returns the context of a usable session', async () => {
    arrange();
    await expect(requireSession('/dashboard')).resolves.toMatchObject({ user: { id: USER_ID } });
  });

  it('redirects to sign-in with next when signed out', async () => {
    arrange({ session: false });
    expect(await redirectOf(requireSession('/admin/users?page=2'))).toBe(
      '/en/sign-in?next=%2Fadmin%2Fusers%3Fpage%3D2',
    );
  });

  it('adds the suspension reason', async () => {
    arrange({ user: { status: 'suspended' } });
    expect(await redirectOf(requireSession('/dashboard'))).toBe(
      '/en/sign-in?next=%2Fdashboard&reason=account_suspended',
    );
  });
});

describe('requirePermission', () => {
  it('returns the context when the role holds the permission', async () => {
    arrange({ user: { role: 'admin' } });
    await expect(requirePermission('admin.users.manage', '/admin/users')).resolves.toMatchObject({
      user: { role: 'admin' },
    });
  });

  it('answers 404 when the role lacks the permission', async () => {
    arrange({ user: { role: 'student' } });
    await expect(requirePermission('admin.users.manage', '/admin/users')).rejects.toBeInstanceOf(
      NotFoundSignal,
    );
  });

  it('redirects to sign-in before checking the permission when signed out', async () => {
    arrange({ session: false });
    expect(await redirectOf(requirePermission('admin.users.manage', '/admin/users'))).toBe(
      '/en/sign-in?next=%2Fadmin%2Fusers',
    );
  });
});
