import type { Page } from '@playwright/test';
import { createStudentProfile } from './db';
import { registerConfirmedStudent, uniqueStudentCode, type RegistrationInput } from './flows';

/**
 * A student who can use the app, made quickly: registers and confirms through the screens, then gets an
 * academic profile directly in the database (level 1, the college's first division; no audit row). The
 * browser is left signed out on the confirmation screen. For signed-in specs that are not about
 * onboarding; onboarding itself is tested through the screens with `registerOnboardedStudent`.
 */
export async function registerStudentWithProfile(
  page: Page,
  input: Partial<RegistrationInput> = {},
): Promise<string> {
  const email = await registerConfirmedStudent(page, input);
  await createStudentProfile(email, { studentCode: uniqueStudentCode() });
  return email;
}
