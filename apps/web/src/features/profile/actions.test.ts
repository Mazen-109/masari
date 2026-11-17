import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@/lib/result';
import { setLocaleAction } from './actions';

// setLocaleAction (contracts/server-actions.md §5.1; FR-037): the branches the e2e test cannot reach.
// Every collaborator is mocked.

const mocks = vi.hoisted(() => ({
  setLocale: vi.fn(),
  getActionContext: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@masari/db', () => ({ users: { setLocale: mocks.setLocale } }));
vi.mock('@/server/auth/action-context', () => ({ getActionContext: mocks.getActionContext }));
vi.mock('@/server/log', () => ({ log: mocks.log }));

const USER_ID = 'user'.repeat(4);

function signedIn(locale: 'ar' | 'en') {
  return {
    ctx: {
      user: { id: USER_ID, name: 'Test', email: 'test@example.edu', role: 'student', locale },
      tenant: { id: 'tenant' },
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
