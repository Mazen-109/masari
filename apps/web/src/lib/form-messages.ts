import { formatNumber } from './format';
import type { Locale } from './locale';
import { ERROR_CODES, FIELD_ERROR_CODES, type ErrorCode, type FieldErrorCode } from './result';

/**
 * The texts the shared form parts show on the client (Field, FormError, SubmitButton): every error code,
 * the pending label, and `common.retryAfter`. They are translated on the server and handed to the
 * browser as plain strings (PR-40, FR-043), so a form needs no message-formatting runtime in the
 * browser. The only plural, `common.retryAfter`, is rendered once per plural category of the locale with
 * a placeholder for the number; the browser picks the category with `Intl.PluralRules`, exactly as the
 * message runtime would (the catalogs use category keys only — `one`, `two`, `few`, `other` — and never
 * `=n` or `#`; `pnpm i18n:check` rejects `#` and a unit test guards both).
 */
export type FormMessages = Readonly<{
  locale: Locale;
  errors: Readonly<Record<ErrorCode | FieldErrorCode, string>>;
  pending: string;
  retryAfter: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;
}>;

/** Stands for the number of minutes in the pre-rendered `retryAfter` variants. */
export const MINUTES_PLACEHOLDER = '{minutes}';

/** A translator over the whole catalog, like next-intl's `getTranslations()` or `createTranslator()`. */
export type CatalogTranslator = (key: string, values?: Record<string, string | number>) => string;

/** The smallest non-negative integer of each plural category of `locale`. */
export function pluralSamples(locale: Locale): Partial<Record<Intl.LDMLPluralRule, number>> {
  const rules = new Intl.PluralRules(locale);
  const samples: Partial<Record<Intl.LDMLPluralRule, number>> = {};
  for (const category of rules.resolvedOptions().pluralCategories) {
    for (let count = 0; count <= 1000; count += 1) {
      if (rules.select(count) === category) {
        samples[category] = count;
        break;
      }
    }
  }
  return samples;
}

/** Translates the form texts with `t` (server side). */
export function buildFormMessages(locale: Locale, t: CatalogTranslator): FormMessages {
  const codes = [...ERROR_CODES, ...FIELD_ERROR_CODES];
  const errors = Object.fromEntries(codes.map((code) => [code, t(`errors.${code}`)])) as Record<
    ErrorCode | FieldErrorCode,
    string
  >;
  const retryAfter = Object.fromEntries(
    Object.entries(pluralSamples(locale)).map(([category, count]) => [
      category,
      t('common.retryAfter', { count, minutes: MINUTES_PLACEHOLDER }),
    ]),
  );
  return { locale, errors, pending: t('common.actions.pending'), retryAfter };
}

/** "You can try again in N minutes." for `minutes`, with Western digits (FR-041). */
export function retryAfterText(messages: FormMessages, minutes: number): string {
  const category = new Intl.PluralRules(messages.locale).select(minutes);
  const template = messages.retryAfter[category] ?? messages.retryAfter.other ?? '';
  return template.replaceAll(MINUTES_PLACEHOLDER, formatNumber(minutes, messages.locale));
}
