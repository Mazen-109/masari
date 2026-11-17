'use server';

import { users } from '@masari/db';
import { z } from 'zod';
import { LOCALES } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { getActionContext } from '@/server/auth/action-context';
import { log } from '@/server/log';

/** Account and academic-profile actions (contracts/server-actions.md §5.1). */

const localeSchema = z.enum(LOCALES);

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * Remembers the signed-in user's language with the account (FR-037): sign-in on any device then lands in
 * it. Called directly by the language switch, which navigates afterwards whatever the answer — the switch
 * itself never depends on this call. No audit: a display preference, not a change to college data.
 */
export async function setLocaleAction(locale: unknown): Promise<ActionResult> {
  const guard = await getActionContext();
  if ('failure' in guard) return guard.failure;

  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return fail('validation', { fieldErrors: { locale: 'invalid_choice' } });

  try {
    if (guard.ctx.user.locale !== parsed.data)
      await users.setLocale(guard.ctx.user.id, parsed.data);
  } catch (error) {
    log.error('profile.set_locale_failed', { errorName: errorName(error) });
    return fail('internal');
  }
  return ok(undefined);
}
