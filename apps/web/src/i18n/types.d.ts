import type messages from '../../messages/ar.json';
import type { routing } from './routing';

// Typed locales and message keys for next-intl (research.md §12). The Arabic catalog is the
// source of truth; `pnpm i18n:check` keeps `en.json` identical in shape.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
