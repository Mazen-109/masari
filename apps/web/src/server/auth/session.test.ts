import type { StudentProfile, Tenant, UserSummary } from '@masari/db';
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
  findProfile: vi.fn<(tx: unknown, userId: string) => Promise<StudentProfile | null>>(),
  withTenant: vi.fn(),
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
  studentProfiles: { findByUserId: mocks.findProfile },
  withTenant: mocks.withTenant,
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

const DIVISION_ID = '22222222-2222-4222-8222-222222222222';

const profile: StudentProfile = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  studentCode: 'CS-2024-001',
  level: 3,
  divisionId: DIVISION_ID,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const TX = { fake: 'tx' };

function arrange(
  over: {
    user?: Partial<UserSummary> | null;
    tenant?: Partial<Tenant> | null;
    session?: boolean;
    profile?: StudentProfile | null;
  } = {},
) {
  mocks.getSession.mockResolvedValue(over.session === false ? null : { user: { id: USER_ID } });
  mocks.findUser.mockResolvedValue(over.user === null ? null : { ...user, ...over.user });
  mocks.findTenant.mockResolvedValue(over.tenant === null ? null : { ...tenant, ...over.tenant });
  mocks.findProfile.mockResolvedValue(over.profile === undefined ? profile : over.profile);
  mocks.withTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn(TX),
  );
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
      studentProfile: { studentCode: 'CS-2024-001', level: 3, divisionId: DIVISION_ID },
    });
    expect(mocks.findUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.findTenant).toHaveBeenCalledWith(TENANT_ID);
    // The profile is read in the user's own college context.
    expect(mocks.withTenant).toHaveBeenCalledExactlyOnceWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.any(Function),
    );
    expect(mocks.findProfile).toHaveBeenCalledExactlyOnceWith(TX, USER_ID);
    await expect(getSessionDenialReason()).resolves.toBe('none');
  });

  it('has a null profile for a student who has none yet', async () => {
    arrange({ profile: null });
    expect((await getSessionContext())?.studentProfile).toBeNull();
  });

  it.each([['faculty'], ['student_affairs'], ['admin']] as const)(
    'does not read a profile for the role %s',
    async (role) => {
      arrange({ user: { role } });
      expect((await getSessionContext())?.studentProfile).toBeNull();
      expect(mocks.withTenant).not.toHaveBeenCalled();
      expect(mocks.findProfile).not.toHaveBeenCalled();
    },
  );

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
    arrange({ user: { role: 'admin' } });
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

  it('redirects a student without an academic profile to onboarding', async () => {
    arrange({ profile: null });
    expect(await redirectOf(requireSession('/dashboard'))).toBe('/en/onboarding');
    // The cached "no profile" is confirmed by a fresh read before redirecting.
    expect(mocks.findProfile).toHaveBeenCalledTimes(2);
  });

  it('lets a student without a profile through with allowIncompleteProfile', async () => {
    arrange({ profile: null });
    await expect(
      requireSession('/onboarding', { allowIncompleteProfile: true }),
    ).resolves.toMatchObject({ user: { id: USER_ID }, studentProfile: null });
    expect(mocks.findProfile).toHaveBeenCalledTimes(1);
  });

  it('does not trust a cached missing profile: a profile created since is used, not redirected', async () => {
    arrange();
    // First read (the cached context) finds nothing; the profile exists by the second read.
    mocks.findProfile.mockResolvedValueOnce(null).mockResolvedValueOnce(profile);
    await expect(requireSession('/dashboard')).resolves.toMatchObject({
      studentProfile: { studentCode: 'CS-2024-001', level: 3, divisionId: DIVISION_ID },
    });
  });

  it('does not read the profile again when the context has one', async () => {
    arrange();
    await requireSession('/dashboard');
    expect(mocks.findProfile).toHaveBeenCalledTimes(1);
  });

  it.each([['faculty'], ['student_affairs'], ['admin']] as const)(
    'never sends the role %s to onboarding',
    async (role) => {
      arrange({ user: { role } });
      await expect(requireSession('/dashboard')).resolves.toMatchObject({
        user: { role },
        studentProfile: null,
      });
    },
  );
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

  it('sends a student without a profile to onboarding before checking the permission', async () => {
    arrange({ profile: null });
    expect(await redirectOf(requirePermission('admin.users.manage', '/admin/users'))).toBe(
      '/en/onboarding',
    );
  });

  it('redirects to sign-in before checking the permission when signed out', async () => {
    arrange({ session: false });
    expect(await redirectOf(requirePermission('admin.users.manage', '/admin/users'))).toBe(
      '/en/sign-in?next=%2Fadmin%2Fusers',
    );
  });
});
