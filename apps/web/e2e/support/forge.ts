import type { BrowserContext, Locator, Page } from '@playwright/test';

// Forged submissions (contracts/server-actions.md §6). Tests never build a Server Action request by hand:
// the browser sends a genuine request from a real rendered form, and the test changes only what an
// attacker could change in the DOM, or the session the browser sends with it (`submitAs`).

/**
 * Sets the value of the form's control named `name`, or — when the form has none — appends a hidden input
 * with that name, so the next submission of the form carries `name=value`. Every control with that name
 * gets the value (a forged field must not be shadowed by an earlier real one).
 */
export async function setFormField(form: Locator, name: string, value: string): Promise<void> {
  await form.evaluate(
    (element, field) => {
      if (!(element instanceof HTMLFormElement)) throw new Error('setFormField: not a form');
      const controls = Array.from(element.elements).filter(
        (control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          (control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement) &&
          control.name === field.name,
      );
      if (controls.length === 0) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = field.name;
        input.value = field.value;
        element.prepend(input);
        return;
      }
      for (const control of controls) {
        if (control instanceof HTMLSelectElement) {
          const option = document.createElement('option');
          option.value = field.value;
          control.append(option);
        }
        control.value = field.value;
      }
    },
    { name, value },
  );
}

/** Cookies and origins of a browser context (`context.storageState()`); shared by the e2e support files. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * Submits a form already on screen with another user's session: replaces the context's cookies with those
 * of `storageState` (e.g. a student's, from roles.ts) without reloading, then runs `submit`, which clicks
 * the form's button. The request carries the real action id of the rendered form and the other user's
 * session. The page must be hydrated first: without JavaScript the form would post as a page navigation.
 */
export async function submitAs(
  page: Page,
  storageState: StorageState,
  submit: () => Promise<void>,
): Promise<void> {
  const context = page.context();
  await context.clearCookies();
  await context.addCookies(storageState.cookies);
  await submit();
}
