import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { TIME_ZONE } from '@/lib/format';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { routing } from './routing';

const MESSAGES = { ar, en } as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return { locale, timeZone: TIME_ZONE, messages: MESSAGES[locale] };
});
