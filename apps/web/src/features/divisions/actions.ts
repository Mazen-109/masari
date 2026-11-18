'use server';

import { divisions, withTenant } from '@masari/db';
import { revalidatePath } from 'next/cache';
import { formFields, parseForm } from '@/lib/form';
import { LOCALES } from '@/lib/locale';
import { fail, ok, type ActionResult } from '@/lib/result';
import { recordAudit } from '@/server/audit';
import { getActionContext } from '@/server/auth/action-context';
import type { SessionContext } from '@/server/auth/session';
import { errorName, sqlStateOf } from '@/server/errors';
import { log } from '@/server/log';
import { changedDivisionFields } from './rules';
import { createDivisionSchema, setDivisionActiveSchema, updateDivisionSchema } from './schemas';

/**
 * The divisions screen (contracts/server-actions.md §5.5; FR-033, FR-044). Every change and its audit row
 * are written in one withTenant transaction, so row-level security limits them to the caller's college:
 * another college's id is answered exactly like an unknown one (`not_found`). Divisions are never deleted.
 * Nothing but event names, error class names, and SQLSTATEs is logged — never a name or a code.
 */

/** Fields echoed back after a failure (`meta.<field>`), so the form is re-filled; never the id. */
const ENTERED_FIELDS = ['divisionCode', 'nameAr', 'nameEn', 'sortOrder'] as const;
/** Long enough for any valid value. */
const MAX_ENTERED_LENGTH = 120;

function withEnteredValues(result: ActionResult, formData: FormData): ActionResult {
  if (result.ok) return result;
  const fields = formFields(formData);
  const meta: Record<string, string | number> = { ...result.meta };
  for (const key of ENTERED_FIELDS) {
    const value = fields[key];
    if (typeof value === 'string') meta[key] = value.slice(0, MAX_ENTERED_LENGTH);
  }
  return { ...result, meta };
}

/** The divisions screen, in both languages. */
function revalidateDivisionScreens(): void {
  for (const locale of LOCALES) revalidatePath(`/${locale}/admin/divisions`);
}

/** Runs one action body: an unexpected error becomes `internal`, logged with its class and SQLSTATE. */
async function run(event: string, body: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await body();
  } catch (error) {
    log.error(event, { errorName: errorName(error), sqlState: sqlStateOf(error) });
    return fail('internal');
  }
}

/** A failed parse of a form with a hidden id: a missing or malformed id names no division. */
function idFailure(failure: ActionResult): ActionResult {
  const fieldErrors = failure.ok ? undefined : failure.fieldErrors;
  return fieldErrors?.divisionId === undefined ? failure : fail('not_found');
}

async function createDivision(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(createDivisionSchema, formData);
  if (!parsed.ok) return parsed.failure;
  const { divisionCode, nameAr, nameEn, sortOrder } = parsed.data;

  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const created = await divisions.create(tx, { code: divisionCode, nameAr, nameEn, sortOrder });
    if (!created.ok) return fail('validation', { fieldErrors: { divisionCode: 'code_taken' } });
    await recordAudit(ctx, { action: 'division.created', targetId: created.value.id }, tx);
    return ok(undefined);
  });
}

/**
 * Adds a division to the caller's college (contracts/server-actions.md §5.5; FR-033): the code is
 * upper-cased and must be unique in the college (`fieldErrors.divisionCode = 'code_taken'`). The new
 * division is active and offered to students at once. Audit `division.created`.
 */
export async function createDivisionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.settings.manage');
  if ('failure' in guard) return guard.failure;

  const result = await run('division.create_failed', () => createDivision(guard.ctx, formData));
  if (result.ok) revalidateDivisionScreens();
  return withEnteredValues(result, formData);
}

async function updateDivision(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(updateDivisionSchema, formData);
  if (!parsed.ok) return idFailure(parsed.failure);
  const { divisionId, ...input } = parsed.data;

  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const current = await divisions.findById(tx, divisionId);
    if (current === null) return fail('not_found');
    const patch = changedDivisionFields(current, input);
    const fields = Object.keys(patch);
    if (fields.length === 0) return ok(undefined);
    if ((await divisions.update(tx, divisionId, patch)) === null) return fail('not_found');
    await recordAudit(
      ctx,
      { action: 'division.updated', targetId: divisionId, metadata: { fields } },
      tx,
    );
    return ok(undefined);
  });
}

/**
 * Changes the names and display order of a division of the caller's college (contracts/server-actions.md
 * §5.5; FR-033). The code is never changed: a submitted one is ignored. An unknown id or another college's
 * → `not_found`, and nothing changes. Only the fields that differ are written and listed in
 * `division.updated {fields}`; nothing differs → `ok`, no write, no audit row.
 */
export async function updateDivisionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.settings.manage');
  if ('failure' in guard) return guard.failure;

  const result = await run('division.update_failed', () => updateDivision(guard.ctx, formData));
  if (result.ok) revalidateDivisionScreens();
  return withEnteredValues(result, formData);
}

async function setDivisionActive(ctx: SessionContext, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(setDivisionActiveSchema, formData);
  if (!parsed.ok) return idFailure(parsed.failure);
  const { divisionId, isActive } = parsed.data;

  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
    const current = await divisions.findById(tx, divisionId);
    if (current === null) return fail('not_found');
    if (current.isActive === isActive) return ok(undefined);
    if ((await divisions.setActive(tx, divisionId, isActive)) === null) return fail('not_found');
    await recordAudit(
      ctx,
      { action: isActive ? 'division.activated' : 'division.deactivated', targetId: divisionId },
      tx,
    );
    return ok(undefined);
  });
}

/**
 * Deactivates or reactivates a division of the caller's college (contracts/server-actions.md §5.5;
 * FR-033): a deactivated division is no longer offered for selection, and students who have it keep it.
 * An unknown id or another college's → `not_found`, and nothing changes. An unchanged state is a success
 * without an audit row; otherwise audit `division.activated` / `division.deactivated`.
 */
export async function setDivisionActiveAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await getActionContext('admin.settings.manage');
  if ('failure' in guard) return guard.failure;

  const result = await run('division.set_active_failed', () =>
    setDivisionActive(guard.ctx, formData),
  );
  if (result.ok) revalidateDivisionScreens();
  return result;
}
