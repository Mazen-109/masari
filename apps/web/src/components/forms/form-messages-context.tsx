'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { FormMessages } from '@/lib/form-messages';

const FormMessagesContext = createContext<FormMessages | null>(null);

/**
 * Hands the server-translated form texts (`@/lib/form-messages`) to the shared form parts below it. Pages
 * use the server component `FormMessages` (`@/i18n/form-messages`), which builds the value; tests render
 * this provider with `buildFormMessages`.
 */
export function FormMessagesProvider({
  value,
  children,
}: Readonly<{ value: FormMessages; children: ReactNode }>) {
  return <FormMessagesContext value={value}>{children}</FormMessagesContext>;
}

/** The form texts of the nearest provider; throws when a form part is rendered without one. */
export function useFormMessages(): FormMessages {
  const messages = useContext(FormMessagesContext);
  if (messages === null) {
    throw new Error('A form part is rendered outside <FormMessages>.');
  }
  return messages;
}

/** The translated text of a field error code (a client leaf, so `Field` also works in server components). */
export function FieldErrorText({ code }: Readonly<{ code: keyof FormMessages['errors'] }>) {
  return useFormMessages().errors[code];
}
