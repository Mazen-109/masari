import { expect, type Locator, type Page } from '@playwright/test';
import { CATALOGS } from './flows';

// The People screen's row actions (PR-33): locators shared by admin-users.spec.ts and rbac.spec.ts.

const t = CATALOGS.ar.admin.users.actions;

/** The row of the People table (on screen, Arabic) whose email is `email`. */
export function userRow(page: Page, email: string): Locator {
  return page.locator('main [data-slot="users-table"] tbody tr').filter({ hasText: email });
}

/** The open "Change role" dialog. */
export function roleDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: t.role.title });
}

/** The open "Suspend this account?" dialog. */
export function suspendDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: t.suspend.title });
}

/** The row's "Change role" button. */
export function roleTrigger(row: Locator): Locator {
  return row.getByRole('button', { name: t.role.open });
}

/** The row's "Suspend" button. */
export function suspendTrigger(row: Locator): Locator {
  return row.getByRole('button', { name: t.suspend.open });
}

/** The row's "Reactivate" button. */
export function reactivateButton(row: Locator): Locator {
  return row.getByRole('button', { name: t.reactivate.submit });
}

/**
 * Clicks `trigger` until `dialog` is open: a click that lands before hydration does nothing. Returns the
 * dialog's form.
 */
export async function openDialog(trigger: Locator, dialog: Locator): Promise<Locator> {
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog.locator('form');
}

/** Clicks `button` and waits for the action's answer (the POST to `screenPath`, e.g. `/ar/admin/users`). */
export async function clickAndWait(page: Page, screenPath: string, button: Locator): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === screenPath,
    ),
    button.click(),
  ]);
}
