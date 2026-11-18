import type { Locator, Page } from '@playwright/test';
import { CATALOGS } from './flows';

// The divisions screen (PR-36): locators shared by admin-divisions.spec.ts and rbac.spec.ts.

const t = CATALOGS.ar.admin.divisions;

/** The add form (on screen, Arabic). */
export function addDivisionForm(page: Page): Locator {
  return page.locator('main [data-slot="division-create-form"]');
}

/** The row of the divisions table whose code is `code`. */
export function divisionRow(page: Page, code: string): Locator {
  return page.locator(`main [data-slot="divisions-table"] tbody tr[data-code="${code}"]`);
}

/** The row's "Edit" button. */
export function editDivisionTrigger(row: Locator): Locator {
  return row.getByRole('button', { name: t.actions.edit.open });
}

/** The open "Edit division" dialog. */
export function editDivisionDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: t.actions.edit.title });
}

/** The row's deactivate / reactivate form. */
export function divisionStatusForm(row: Locator): Locator {
  return row.locator('[data-slot="division-status-form"]');
}
