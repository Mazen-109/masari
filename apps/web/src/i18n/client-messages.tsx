import { NextIntlClientProvider, type Messages, type NestedKeyOf } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { FormMessages } from './form-messages';
import { pickMessages, type MessageTree } from './pick-messages';

/** A dotted path into the catalog: a namespace (`auth.signIn`) or one message (`common.retryAfter`). */
export type ClientNamespace = NestedKeyOf<Messages>;

/**
 * Gives the client components below it the messages of `namespaces` only (PR-40, FR-043). The locale
 * layout renders no message provider: the whole catalog in every page's payload was a third of the HTML,
 * and screens whose client components translate nothing (the signed-in shell, the dashboard) now load no
 * next-intl client code at all. Wrap every client component that calls `useTranslations`/`useLocale`;
 * server components translate on the server and need no provider. `forms` also provides the texts of
 * the shared form parts (`FormMessages`).
 */
export async function ClientMessages({
  namespaces,
  forms = false,
  children,
}: Readonly<{ namespaces: readonly ClientNamespace[]; forms?: boolean; children: ReactNode }>) {
  const messages = (await getMessages()) as MessageTree;
  const provider = (
    <NextIntlClientProvider messages={pickMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
  return forms ? <FormMessages>{provider}</FormMessages> : provider;
}
