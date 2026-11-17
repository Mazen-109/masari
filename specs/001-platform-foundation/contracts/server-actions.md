# Contract: Server Actions

**Feature**: `001-platform-foundation` · Applies to `apps/web/src/features/*/actions.ts`

Server Actions are the only way the UI mutates data. Each is an exported `async` function in a file that
starts with `"use server"`.

## 1. Common shape

```ts
// apps/web/src/lib/result.ts
export type ErrorCode =
  | 'validation'            // fieldErrors present
  | 'unauthenticated'       // no valid session
  | 'forbidden'             // role lacks the permission, or acting on self where not allowed
  | 'not_found'             // target does not exist in the caller's college
  | 'conflict'              // state no longer allows the action (e.g. invitation not pending)
  | 'rate_limited'          // retryAfterSeconds present
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'account_suspended'
  | 'tenant_suspended'
  | 'token_invalid'         // confirmation / reset / invitation token invalid, expired, used, or revoked
  | 'internal';             // unexpected; details only in server logs

export type FieldErrorCode =
  | 'required' | 'too_short' | 'too_long' | 'invalid_format' | 'invalid_email' | 'invalid_choice'
  | 'out_of_range' | 'password_too_short' | 'password_too_long' | 'consent_required'
  | 'domain_not_allowed' | 'email_unavailable' | 'student_code_taken' | 'code_taken'
  | 'levels_in_use' | 'too_many';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; fieldErrors?: Record<string, FieldErrorCode>;
      retryAfterSeconds?: number; meta?: Record<string, string | number> };

export const ok: <T>(data: T) => ActionResult<T>;            // ok(undefined) for no data
export const fail: (code: ErrorCode, extra?: {...}) => ActionResult<never>;
```

- **Form actions** have the signature `(prev: ActionResult<T> | null, formData: FormData) =>
  Promise<ActionResult<T>>` and are used with `useActionState`. On success they either return `ok(...)` or
  call `redirect(...)` (stated per action).
- **Order of work inside every action**: (1) guard → (2) parse `FormData` with the Zod schema from the
  feature's `schemas.ts` (first error per field → `fieldErrors`, code `validation`) → (3) rate limit (public
  actions) → (4) business rules + repository calls inside `withTenant` → (5) audit → (6) `revalidatePath`
  for affected screens → (7) result/redirect.
- **Audit and transactions**: when the change is made through `tx` repositories, the audit event is written
  in the **same** `withTenant` transaction (`recordAudit(ctx, event, tx)` → `audit.record(tx, …)`), so the
  change and its audit row commit or roll back together. Only when the change is not a `withTenant`
  transaction (auth-library calls; `users` / `sessions` functions that use the pool) is the audit written
  right after the change succeeds with `recordAudit(ctx, event)`, which opens its own transaction.
- `auth.api.*` in this document means `getAuth().api.*`: `server/auth/auth.ts` exports a lazy, memoised
  `getAuth()` and creates no auth instance at module scope (`http-and-env.md` §3 "Parsing").
- Unknown exceptions are caught, logged with `log.error(event, { errorName })` (no personal data), and
  returned as `fail('internal')`. Redirect/not-found signals thrown by Next.js are re-thrown.
- Error and field codes are translated in the UI from the `errors` message namespace; actions never return
  human-readable text.
- Every string input is trimmed; emails are lower-cased; unknown form fields are ignored.
- **Guards** (`apps/web/src/server/auth/action-context.ts`):
  `getActionContext(permission?: Permission): Promise<{ ctx: SessionContext } | { failure: ActionResult<never> }>`
  → `unauthenticated` without a valid session, `forbidden` when `permission` is given and
  `can(ctx.user.role, permission)` is false.

## 2. Rate-limit policy (`apps/web/src/server/rate-limit.ts`)

`enforceRateLimit(rules: { key: string; limit: number; windowSeconds: number }[])` calls
`hitRateLimit` for each rule and returns the first refusal as `fail('rate_limited', { retryAfterSeconds })`.
Keys are `"<purpose>:<kind>:<sha256 hex of value>"`. The per-IP value is `getClientIp()` as defined in
`http-and-env.md` §5 (never the raw first `x-forwarded-for` entry); when it is `null`, the per-IP rule is
still applied, on the shared value `unknown`.

| Purpose | Per email | Per IP |
|---|---|---|
| `signin` | 10 / 600 s | 100 / 600 s |
| `register` | 3 / 3600 s | 60 / 600 s |
| `verify-resend` | 3 / 3600 s | 60 / 600 s |
| `reset-request` | 3 / 3600 s | 60 / 600 s |
| `invite-accept` | — | 30 / 600 s |
| `invite-create` | per acting user id: 60 / 3600 s | — |

## 3. Shared field rules (Zod, `features/*/schemas.ts`)

| Field | Rule | Field error codes |
|---|---|---|
| `name` | string, 2–100 chars after trim | `required`, `too_short`, `too_long` |
| `email` | trimmed, lower-cased, valid email, ≤ 254 chars | `required`, `invalid_email`, `too_long` |
| `password` (new) | 10–128 chars, not trimmed | `required`, `password_too_short`, `password_too_long` |
| `password` (sign-in) | at least 1 char, not trimmed; the 128-char maximum is enforced by the auth library (`maxPasswordLength`) and reported as `invalid_credentials`, never as a field error | `required` |
| `consent` | must be `"on"` | `consent_required` |
| `tenantSlug` | `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–40 | `required`, `invalid_choice` |
| `role` | one of `ROLES` | `invalid_choice` |
| `studentCode` | `^[A-Za-z0-9-]{3,20}$` after trim | `required`, `invalid_format` |
| `level` | integer 1–7 (then ≤ college `levelsCount`) | `required`, `out_of_range` |
| `divisionId` | uuid | `required`, `invalid_choice` |
| `divisionCode` | upper-cased, `^[A-Z0-9_-]{1,16}$` | `required`, `invalid_format` |
| `nameAr` / `nameEn` (division) | 1–80 chars | `required`, `too_long` |
| `nameAr` / `nameEn` (college) | 1–120 chars | `required`, `too_long` |
| `sortOrder` | integer 0–9999, default 0 | `out_of_range` |
| `allowedEmailDomains` | text split on commas/whitespace/newlines → lower-cased domains, each valid, de-duplicated, ≤ 20 | `invalid_format`, `too_many` |
| `levelsCount` | integer 1–7 | `out_of_range`, `levels_in_use` |
| `enabledModules` | subset of `MODULE_KEYS` (repeated form field) | `invalid_choice` |
| `locale` | `ar` \| `en` | `invalid_choice` |

## 4. Public actions — `features/auth/actions.ts`

### 4.1 `registerStudentAction` (form) — FR-001…FR-005, FR-009, FR-011, FR-013, FR-023

Fields: `tenantSlug`, `name`, `email`, `password`, `consent`. Locale from `getLocale()`.

1. Validate. 2. Rate limit `register` (email + IP).
3. College = `tenants.findBySlug`; missing or not `active` → `fieldErrors.tenantSlug = 'invalid_choice'`.
4. If the college has allowed domains and the email's domain is not one of them →
   `fieldErrors.email = 'domain_not_allowed'`, `meta.domains = "<comma-separated list>"`.
5. If a user with this email exists (any college) → send `account-exists` email → go to step 9.
6. If a non-expired pending invitation exists for (college, email) → send `invitation-pending` email → step 9.
7. Create the account through the auth library (`auth.api.signUpEmail`) with `name`, `email`, `password`,
   `tenantId`, `locale`, `privacyConsentAt = now`; role and status take their defaults (`student`, `active`).
   Then send the confirmation email (`auth.api.sendVerificationEmail`, callback
   `/{locale}/email-verified`).
8. Audit `user.registered`.
9. `redirect('/{locale}/verify-email')` — identical for steps 5, 6, and 7.

Never returns information that distinguishes steps 5/6/7. If sending an email in steps 5–7 fails, log
`email.failed` (template name only) and still continue to step 9 — the user can request the confirmation
email again from the "check your email" screen.

### 4.2 `resendVerificationAction` (form) — FR-004, FR-005, FR-009

Fields: `email`. Validate → rate limit `verify-resend` → if a user with this email exists and is not
verified, send the confirmation email → always `ok(undefined)` (UI shows "if an account needs
confirmation, we sent a new email").

### 4.3 `signInAction` (form) — FR-006, FR-008, FR-009, FR-019, FR-037

Fields: `email`, `password`, `next` (optional).

1. Validate. 2. Rate limit `signin` (email + IP).
3. `auth.api.signInEmail`. Library error "email not verified" → `fail('email_not_verified')`; any other
   failure → `fail('invalid_credentials')`.
4. Load the user and college. User `suspended` → revoke the user's sessions, clear the cookie, return
   `fail('account_suspended')`. College `suspended` → end only the session just created (`auth.api.signOut`,
   which also clears the cookie) and return `fail('tenant_suspended')`; the user's other sessions are left in
   place (they are refused on every request while the college is suspended — `cli.md` §5).
5. Audit `auth.sign_in`.
6. `redirect(next ? '/{user.locale}' + next : '/{user.locale}/dashboard')`, where `next` is
   `localeLessNext(next)` (`lib/safe-next.ts`: `safeNext`, then a leading `/ar` or `/en` segment removed, so
   `next=/en/dashboard` never becomes `/ar/en/dashboard`).

**Ending the session just created** (steps 4 and the failure path below) is always the same two calls:
`auth.api.signOut` with that session's cookie (clears the cookie), **then always** `sessions.revokeByToken(token)`
— the library's sign-out swallows (only logs) a failing session delete, so its success does not prove the row
is gone; the repository call is idempotent (0 rows when the library already deleted it). Each call's failure is
logged (`auth.new_session_sign_out_failed`, `auth.new_session_revoke_failed`) and never thrown. The session is
ended at most once per sign-in: when a later step fails after it was already ended (e.g. revoking a suspended
account's other sessions), it is not ended again.

Any failure in steps 4–5 (reading the user or college, revoking sessions, the audit) first ends the session
just created as above, logs only event and error class names, and returns `fail('internal')`: a sign-in is
never left signed in without its audit row. A user or college that cannot be found after the library signed
in is logged as `auth.sign_in_account_missing` (warn) and handled the same way.

### 4.4 `signOutAction` (form, no fields) — FR-008

Audit `auth.sign_out` (only with a usable session) → `auth.api.signOut` → `redirect('/{locale}/sign-in')`.
`auth.api.signOut` runs also when `getSessionContext()` is `null` (e.g. the account or college was suspended
after signing in), so any session the library can read from the cookie is still ended; without a session
cookie it only clears the cookie. A failing audit is logged (`auth.sign_out_audit_failed`) and does not block
sign-out; a failing library call is logged (`auth.sign_out_failed`) and still redirects.

### 4.5 `requestPasswordResetAction` (form) — FR-005, FR-009, FR-010

Fields: `email`. Validate → rate limit `reset-request` → ask the auth library to send the reset email
(redirect target `/{locale}/reset-password`) → if the user exists (`users.findByEmail(email)`, which also
gives the college for the audit), audit `auth.password_reset_requested` → always `ok(undefined)`.

### 4.6 `resetPasswordAction` (form) — FR-007, FR-010

Fields: `token`, `password` (new). Validate → `auth.api.resetPassword`; invalid/expired/used token →
`fail('token_invalid')`. On success all sessions of the account are revoked (library option; verified by an
e2e test), audit `auth.password_reset`, `redirect('/{locale}/sign-in?reset=1')`.

Source of the audit's user and college: `auth.api.resetPassword` does not return the user, so the event is
written by the auth instance's `emailAndPassword.onPasswordReset` hook in `server/auth/auth.ts` (called by
the library with the user after a successful reset; added in PR-24):
`recordAudit({ tenantId: user.tenantId, userId: user.id }, { action: 'auth.password_reset', … })`. If the
pinned version has no such hook, obtain the user in another documented way and record a Spec deviation; the
action never decodes or looks up the token itself.

### 4.7 `acceptInvitationAction` (form) — FR-009, FR-011, FR-020, FR-021

Fields: `token`, `name`, `password` (new), `consent`.

All database calls are the `db-api.md` §1 functions, in the context named for each step.

1. Validate. 2. Rate limit `invite-accept` (IP).
3. Look up — `findUsableInvitation(token)` in `apps/web/src/server/auth/invitation-lookup.ts`, shared with the
   `/invite/[token]` page (which shows the form only for a non-null result):
   1. `tokenHash = hashInvitationToken(token)`;
   2. `inv = withInvitationToken(tokenHash, tx => invitations.findByTokenHash(tx, tokenHash))` — anonymous
      context, RLS policy `invitation_token_lookup`;
   3. `tenant = tenants.findById(inv.tenantId)` — global table, no tenant context;
   4. result `{ invitation: inv, tenant }` only when `inv` exists, `inv.status = 'pending'`,
      `inv.expiresAt > now`, and `tenant.status = 'active'` (the college-active check happens here, in the
      web layer); otherwise `null` → `fail('token_invalid')`.
4. If `users.findByEmail(inv.email)` returns a user → `fail('token_invalid')`.
5. Claim: `withTenant({ tenantId: inv.tenantId, userId: null }, tx => invitations.claim(tx, inv.id))`;
   `null` → `fail('token_invalid')`.
6. Create the account: `auth.api.signUpEmail` (the library's own connection, outside any transaction) with
   the invitation's email and `tenantId`, `locale`, `privacyConsentAt = now`; then
   `users.activateInvited(inv.tenantId, userId, inv.role)` (sets role and `email_verified = true`); then, in
   one `withTenant({ tenantId: inv.tenantId, userId }, tx => …)` transaction,
   `invitations.setAcceptedUser(tx, inv.id, userId)` and the audit of step 7. No confirmation email is sent.
   On any failure in this step, compensate in this order and return `fail('internal')`:
   (a) if the account was created (id from the library's result, else `users.findByEmail(inv.email)`),
   `users.deleteJustCreated(inv.tenantId, userId)` — otherwise step 4 would make the invitation unusable
   forever; (b) `withTenant({ tenantId: inv.tenantId, userId: null }, tx => invitations.release(tx, inv.id))`.
   A failing compensation is logged as `invitation.accept_compensation_failed` (ids only).
7. Audit `invitation.accepted` `{ role }` — `recordAudit(…, tx)` in the transaction of step 6.
8. `redirect('/{locale}/sign-in?invited=1')`.

## 5. Signed-in actions

### 5.1 `features/profile/actions.ts`

| Action | Permission | Fields | Rules | Audit | Result |
|---|---|---|---|---|---|
| `setLocaleAction(locale)` (direct call, not a form) | session | `locale` | — | — | `ok`; the caller then navigates |
| `updateAccountAction` (form) — FR-027 | session | `name` | — | — | `ok`; revalidate `/profile`, `/dashboard` |
| `completeStudentProfileAction` (form) — FR-024…026 | `profile.academic.manage_own` | `studentCode`, `level`, `divisionId` | profile must not exist (`conflict`); `level ≤ levelsCount` (`out_of_range`); division active in college (`invalid_choice`); unique code (`student_code_taken`) | `profile.created` | `redirect('/{locale}/dashboard')` |
| `updateStudentProfileAction` (form) — FR-026, FR-027 | `profile.academic.manage_own` | `level`, `divisionId` | profile must exist (`not_found`); same level/division rules; current division allowed even if inactive | `profile.updated {fields}` | `ok`; revalidate `/profile`, `/dashboard` |

### 5.2 `features/invitations/actions.ts` — permission `admin.invitations.manage`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `createInvitationAction` (form) — FR-020 | `email`, `role` | rate limit `invite-create`; a user with this email exists (any college) → `fieldErrors.email = 'email_unavailable'`; non-expired pending invitation for this email in this college → `email_unavailable`; an expired pending one is revoked first. Creates the invitation, sends the `invitation` email with link `{APP_URL}/ar/invite/{token}` | `invitation.created {role}` | `ok`; revalidate `/admin/invitations` |
| `revokeInvitationAction` (form) — FR-022 | `invitationId` | must be `pending` in the caller's college, else `not_found` / `conflict` | `invitation.revoked` | `ok`; revalidate |

If sending the invitation email fails, the invitation stays pending, the failure is logged, and the action
returns `fail('internal')`; the administrator revokes and re-invites.

### 5.3 `features/admin-users/actions.ts` — permission `admin.users.manage`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `changeUserRoleAction` (form) — FR-030 | `userId`, `role` | target in caller's college else `not_found`; target ≠ caller else `forbidden`; no-op if unchanged | `user.role_changed {from,to}` | `ok`; revalidate `/admin/users` |
| `setUserStatusAction` (form) — FR-031 | `userId`, `status` (`active` \| `suspended`) | same college else `not_found`; target ≠ caller else `forbidden`; on `suspended` revoke all the target's sessions | `user.suspended` / `user.reactivated` | `ok`; revalidate |
| `adminUpdateStudentProfileAction` (form) — FR-028 | `userId`, `studentCode`, `level`, `divisionId` | target in caller's college with role `student` else `not_found`; same field rules as the student's own form; creates the profile if missing | `profile.updated {fields}` (or `profile.created`) | `ok`; revalidate |

### 5.4 `features/tenant-settings/actions.ts` — permission `admin.settings.manage`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `updateTenantSettingsAction` (form) — FR-032, FR-034 | `nameAr`, `nameEn`, `allowedEmailDomains`, `levelsCount`, `enabledModules[]` | `levelsCount` ≥ highest level in use else `fieldErrors.levelsCount = 'levels_in_use'`, `meta.min = <highest>` | `tenant.settings_updated {fields}` when any of the first four changed; `tenant.modules_updated {enabled}` when modules changed | `ok`; `revalidatePath('/', 'layout')` |

### 5.5 `features/divisions/actions.ts` — permission `admin.settings.manage`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `createDivisionAction` (form) — FR-033 | `divisionCode`, `nameAr`, `nameEn`, `sortOrder` | duplicate code in college → `fieldErrors.divisionCode = 'code_taken'` | `division.created` | `ok`; revalidate `/admin/divisions` |
| `updateDivisionAction` (form) | `divisionId`, `nameAr`, `nameEn`, `sortOrder` | must exist in college else `not_found`; code not editable | `division.updated {fields}` | `ok`; revalidate |
| `setDivisionActiveAction` (form) | `divisionId`, `isActive` (`"true"` \| `"false"`) | must exist in college else `not_found` | `division.activated` / `division.deactivated` | `ok`; revalidate |

## 6. Test obligations

- `schemas.ts` and `rules.ts` of every feature: unit tests for each rule and each field error code.
- Each action: at least one e2e scenario for success and one for each distinct failure visible to the user
  (validation, forbidden role, cross-college target, rate limit where applicable).
- Cross-college: for every action taking an id (`userId`, `invitationId`, `divisionId`), an e2e or
  integration test supplies an id from another college and expects `not_found` with no change.

**How e2e tests forge a submission** (`apps/web/e2e/support/forge.ts`, added in PR-23 and extended in
PR-30). Tests never build a Server Action request by hand: action ids and the request encoding are
framework internals that change between builds. Instead the browser sends a genuine request from a real
rendered form, and the test changes only what an attacker could change:

- **Another role's action** — `submitAs(page, storageState, submit)`: open the screen as a user who is
  allowed to see the form (e.g. the administrator), then, without reloading, replace the browser context's
  cookies with those of the other user (`context.clearCookies()` + `context.addCookies(…)` from that user's
  saved storage state) and submit the form. The request carries the real action id with the other user's
  session. Expect the form's error summary to show the `forbidden` (or `unauthenticated`) message.
- **A forged field or id** — `setFormField(form, name, value)`: before submitting, set a hidden input's value
  (another college's id, the actor's own id) or append an extra hidden input (`studentCode`, `role`,
  `status`) in the DOM through `locator.evaluate`. Expect `not_found` / `forbidden`, or that the extra field
  was ignored.
- After every forged submission the test also asserts that nothing changed, through `e2e/support/db.ts`
  (row values and `countAuditEvents` before and after).
