import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import {
  buildFormMessages,
  MINUTES_PLACEHOLDER,
  pluralSamples,
  retryAfterText,
  type CatalogTranslator,
} from './form-messages';
import { formatNumber } from './format';
import type { Locale } from './locale';
import { ERROR_CODES, FIELD_ERROR_CODES } from './result';

const CATALOGS = { ar, en } as const;
const translator = (locale: Locale) =>
  createTranslator({ locale, messages: CATALOGS[locale] }) as unknown as CatalogTranslator;

describe('pluralSamples', () => {
  it('finds one number per plural category', () => {
    expect(pluralSamples('en')).toEqual({ one: 1, other: 0 });
    expect(pluralSamples('ar')).toEqual({ zero: 0, one: 1, two: 2, few: 3, many: 11, other: 100 });
  });
});

describe.each(['ar', 'en'] as const)('form messages (%s)', (locale) => {
  const messages = buildFormMessages(locale, translator(locale));
  const t = translator(locale);

  it('translates every error code and the pending label', () => {
    for (const code of [...ERROR_CODES, ...FIELD_ERROR_CODES]) {
      expect(messages.errors[code]).toBe(CATALOGS[locale].errors[code]);
    }
    expect(messages.pending).toBe(CATALOGS[locale].common.actions.pending);
  });

  it('renders the retry time exactly as the message runtime does, for 1 to 120 minutes', () => {
    for (let minutes = 1; minutes <= 120; minutes += 1) {
      const expected = t('common.retryAfter', {
        count: minutes,
        minutes: formatNumber(minutes, locale),
      });
      expect(retryAfterText(messages, minutes)).toBe(expected);
    }
  });

  it('keeps the placeholder only in the pre-rendered variants', () => {
    for (const variant of Object.values(messages.retryAfter)) {
      expect(variant).not.toContain('{count');
    }
    expect(retryAfterText(messages, 7)).not.toContain(MINUTES_PLACEHOLDER);
  });
});

it('the retry message selects plural categories by name only (no `=n` cases, no `#`)', () => {
  for (const catalog of [ar, en]) {
    expect(catalog.common.retryAfter).not.toMatch(/=\d|#/);
  }
});
