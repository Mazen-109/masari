import { describe, expect, it } from 'vitest';
import { FALLBACK_TEXT } from '@/lib/fallback-text';
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

// `lib/fallback-text.ts` copies catalog strings for pages without a catalog; keep them equal.
describe.each([
  ['ar', ar, FALLBACK_TEXT.ar],
  ['en', en, FALLBACK_TEXT.en],
] as const)('%s fallback text', (_locale, catalog, text) => {
  it('matches the catalog entries', () => {
    expect({ ...text }).toEqual({
      errorTitle: catalog.common.error.title,
      errorBody: catalog.common.error.body,
      tryAgain: catalog.common.actions.tryAgain,
      notFoundTitle: catalog.meta.notFound,
    });
  });
});
