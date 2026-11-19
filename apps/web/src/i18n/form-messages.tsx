import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { FormMessagesProvider } from '@/components/forms/form-messages-context';
import { buildFormMessages, type CatalogTranslator } from '@/lib/form-messages';
import { DEFAULT_LOCALE, isLocale } from '@/lib/locale';

/**
 * Translates the texts of the shared form parts (Field, FormError, SubmitButton) on the server and hands
 * them to the forms below it as plain strings (PR-40). A form whose own labels also come from the server
 * as props (sign-in) then loads no next-intl client code. Wrap every client form in it; `ClientMessages`
 * does so with `forms`.
 */
export async function FormMessages({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  const t = (await getTranslations()) as unknown as CatalogTranslator;
  return (
    <FormMessagesProvider value={buildFormMessages(isLocale(locale) ? locale : DEFAULT_LOCALE, t)}>
      {children}
    </FormMessagesProvider>
  );
}
