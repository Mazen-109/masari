'use server';

import { MODULE_KEYS, studentProfiles, tenants, withTenant } from '@masari/db';
import { revalidatePath } from 'next/cache';
import { fieldErrorsOf, formFields } from '@/lib/form';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { errorName, sqlStateOf } from '@/server/errors';
import { log } from '@/server/log';
import { changedFields, type TenantSettings } from './rules';
import { MAX_DOMAINS_TEXT_LENGTH, tenantSettingsSchema, type TenantSettingsInput } from './schemas';

/** The college settings form (contracts/server-actions.md §5.4). */

/** Text fields echoed back after a failure (`meta.<field>`) so the form is re-filled. */
const ENTERED_TEXT_FIELDS = ['nameAr', 'nameEn', 'allowedEmailDomains', 'levelsCount'] as const;

/**
 * Echoes the entered values; the checked modules as one comma-separated `meta.enabledModules` (known keys
 * only, so a forged value is never sent back).
 */
function withEnteredValues(result: ActionResult, formData: FormData): ActionResult {
  if (result.ok) return result;
  const fields = formFields(formData);
  const meta: Record<string, string | number> = { ...result.meta };
  for (const key of ENTERED_TEXT_FIELDS) {
    const value = fields[key];
    if (typeof value === 'string') meta[key] = value.slice(0, MAX_DOMAINS_TEXT_LENGTH);
  }
  const known: readonly string[] = MODULE_KEYS;
  meta.enabledModules = formData
    .getAll('enabledModules')
    .filter((value): value is string => typeof value === 'string' && known.includes(value))
    .join(',');
  return { ...result, meta };
}

function parseSettings(
  formData: FormData,
): { ok: true; data: TenantSettingsInput } | { ok: false; failure: ActionResult } {
  const input = { ...formFields(formData), enabledModules: formData.getAll('enabledModules') };
  const parsed = tenantSettingsSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, failure: fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) }) };
}

/**
 * In one withTenant transaction: lock the college's row → refuse fewer levels than the highest level a
 * student holds → write only the changed fields → audit them. Nothing changed → `ok`, no write, no audit.
 */
async function updateSettings(ctx: SessionContext, input: TenantSettings): Promise<ActionResult> {
  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    // The lock serialises concurrent saves. The college's status is not re-checked inside it: the guard
    // read it at the start of this request, so a suspension committed in the moment between that read
    // and this lock still lets this one save through (an accepted, tiny window; the next request is
    // refused).
    const before = await tenants.findCurrentForUpdate(tx);
    if (before === null) return fail('not_found');

    if (input.levelsCount < before.levelsCount) {
      const highest = await studentProfiles.maxLevelInUse(tx);
      if (input.levelsCount < highest) {
        return fail('validation', {
          fieldErrors: { levelsCount: 'levels_in_use' },
          meta: { min: highest },
        });
      }
    }

    const fields = changedFields(before, input);
    if (fields.length === 0) return ok(undefined);
    await tenants.updateSettings(tx, {
      nameAr: fields.includes('nameAr') ? input.nameAr : undefined,
      nameEn: fields.includes('nameEn') ? input.nameEn : undefined,
      allowedEmailDomains: fields.includes('allowedEmailDomains')
        ? [...input.allowedEmailDomains]
        : undefined,
      levelsCount: fields.includes('levelsCount') ? input.levelsCount : undefined,
      enabledModules: fields.includes('enabledModules') ? [...input.enabledModules] : undefined,
    });

    const settingsFields = fields.filter((field) => field !== 'enabledModules');
    if (settingsFields.length > 0) {
      await recordAudit(
        ctx,
        {
          action: 'tenant.settings_updated',
          targetId: before.id,
          metadata: { fields: settingsFields },
        },
        tx,
      );
    }
    if (fields.includes('enabledModules')) {
      await recordAudit(
        ctx,
        {
          action: 'tenant.modules_updated',
          targetId: before.id,
          metadata: { enabled: [...input.enabledModules] },
        },
        tx,
      );
    }
    return ok(undefined);
  });
}

/**
 * Saves the college's names, allowed email domains, number of levels, and enabled modules
 * (contracts/server-actions.md §5.4; FR-032, FR-034, FR-044). Fewer levels than the highest level a
 * student of the college holds → `fieldErrors.levelsCount = 'levels_in_use'` with `meta.min`. Audits
 * `tenant.settings_updated {fields}` and `tenant.modules_updated {enabled}`; refreshes every screen (the
 * header shows the names, navigation and home the modules). Names and domains are never logged.
 */
export async function updateTenantSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.settings.manage');
  if ('failure' in guard) return guard.failure;

  const parsed = parseSettings(formData);
  if (!parsed.ok) return withEnteredValues(parsed.failure, formData);

  let result: ActionResult;
  try {
    result = await updateSettings(guard.ctx, parsed.data);
  } catch (error) {
    log.error('tenant.settings_update_failed', {
      errorName: errorName(error),
      sqlState: sqlStateOf(error),
    });
    result = fail('internal');
  }
  if (result.ok) revalidatePath('/', 'layout');
  return withEnteredValues(result, formData);
}
