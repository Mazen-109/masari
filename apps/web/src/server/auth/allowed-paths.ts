/**
 * Allow-list of the auth library's HTTP handler (contracts/http-and-env.md §1.2, research.md §7, FR-013).
 * Only the targets of the links the library puts into emails are served; every other request — including
 * the library's own sign-up and sign-in endpoints — gets a 404 without the library being called, so all
 * account operations go through Masari's Server Actions (college rules, rate limits, audit).
 *
 * `pathname` is the request's parsed pathname (`new URL(request.url).pathname`): dot segments are already
 * resolved, and percent-encoded characters are left encoded, so an encoded `/` or `.` never matches.
 */

const EXACT_PATHS = new Set(['/api/auth/verify-email', '/api/auth/error']);

/** The reset token is a single path segment of URL-safe characters (no encoding, no slash). */
const RESET_PASSWORD_PATH = /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{1,256}$/;

/** method is upper-case; pathname is the full request pathname. */
export function isAllowedAuthRequest(method: string, pathname: string): boolean {
  if (method !== 'GET') return false;
  return EXACT_PATHS.has(pathname) || RESET_PASSWORD_PATH.test(pathname);
}
