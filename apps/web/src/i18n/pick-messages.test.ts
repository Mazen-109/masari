import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import { pickMessages, type MessageTree } from './pick-messages';

const messages: MessageTree = {
  common: { appName: 'Masari', actions: { save: 'Save', pending: 'Please wait…' } },
  errors: { validation: 'Check the fields.' },
  auth: { signIn: { title: 'Sign in' }, register: { title: 'Create an account' } },
};

describe('pickMessages', () => {
  it('keeps only the named namespaces, with their nesting', () => {
    expect(pickMessages(messages, ['errors', 'auth.signIn', 'common.actions'])).toEqual({
      errors: { validation: 'Check the fields.' },
      auth: { signIn: { title: 'Sign in' } },
      common: { actions: { save: 'Save', pending: 'Please wait…' } },
    });
  });

  it('merges namespaces that share a parent and accepts a single message', () => {
    expect(pickMessages(messages, ['common.actions.save', 'common.appName'])).toEqual({
      common: { actions: { save: 'Save' }, appName: 'Masari' },
    });
  });

  it('returns an empty object for no namespaces', () => {
    expect(pickMessages(messages, [])).toEqual({});
  });

  it('throws on an unknown namespace instead of leaving the client without its messages', () => {
    expect(() => pickMessages(messages, ['auth.forgot'])).toThrow('"auth.forgot"');
    expect(() => pickMessages(messages, ['common.appName.x'])).toThrow('"common.appName.x"');
    expect(() => pickMessages(messages, ['toString'])).toThrow('"toString"');
  });

  it('does not change the catalog', () => {
    const before = JSON.stringify(ar);
    pickMessages(ar, ['common.actions', 'common.retryAfter', 'errors']);
    expect(JSON.stringify(ar)).toBe(before);
  });
});
