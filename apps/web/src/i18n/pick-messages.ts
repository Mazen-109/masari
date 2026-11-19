/** A message catalog or a part of it: nested objects whose leaves are message strings. */
export type MessageTree = { [key: string]: string | MessageTree };

/**
 * The part of `messages` a client component needs: one entry per dotted namespace (`errors`,
 * `auth.signIn`, `common.actions`), keeping the nesting, so `useTranslations('auth.signIn')` works on the
 * result. Overlapping namespaces merge. An unknown namespace is a programming error and throws.
 */
export function pickMessages(messages: MessageTree, namespaces: readonly string[]): MessageTree {
  const picked: MessageTree = {};
  for (const namespace of namespaces) {
    const keys = namespace.split('.');
    let source: string | MessageTree | undefined = messages;
    let target = picked;
    keys.forEach((key, index) => {
      source = typeof source === 'object' && Object.hasOwn(source, key) ? source[key] : undefined;
      if (source === undefined) throw new Error(`Unknown message namespace "${namespace}"`);
      if (index === keys.length - 1) {
        target[key] = source;
        return;
      }
      const next = target[key];
      target = typeof next === 'object' ? next : (target[key] = {});
    });
  }
  return picked;
}
