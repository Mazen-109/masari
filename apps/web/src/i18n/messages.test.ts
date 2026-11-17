import { describe, expect, it } from 'vitest';
import { ERROR_CODES, FIELD_ERROR_CODES } from '@/lib/result';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

// The `errors` namespace must translate every code an action can return (contracts/server-actions.md).
describe.each([
  ['ar', ar],
  ['en', en],
])('%s.json errors namespace', (_locale, catalog) => {
  const errors: Record<string, unknown> = catalog.errors;

  it.each([...ERROR_CODES, ...FIELD_ERROR_CODES])('has a message for %s', (code) => {
    expect(typeof errors[code]).toBe('string');
    expect(String(errors[code]).trim()).not.toBe('');
  });
});
