# Contract: `@masari/db` Public API

**Feature**: `001-platform-foundation` · Package `packages/db`

`@masari/db` is the only code that talks to PostgreSQL. It exposes three entry points
(`package.json` `exports`); nothing else may be imported from outside the package.

| Entry point | File | Who may import it | Connection |
|---|---|---|---|
| `@masari/db` | `src/index.ts` | anything in `apps/web/src` | runtime role (`DATABASE_URL`) |
| `@masari/db/auth` | `src/auth.ts` | only `apps/web/src/server/auth/auth.ts` (ESLint `no-restricted-imports`) | runtime role |
| `@masari/db/admin` | `src/admin.ts` | `packages/db/scripts/**`, `packages/db/test/**`, `apps/web/e2e/**`, `apps/web/playwright.config.ts` — never `apps/web/src/**` (ESLint) | owner (`DATABASE_MIGRATION_URL`) |

General rules

- Repository functions take the transaction handle `tx: Tx` as their first argument when they touch
  tenant-scoped tables, and can only be obtained from `withTenant` / `withInvitationToken`.
- Functions on global tables (`tenants` reads, `users`, `sessions`, rate limiter) use the pool directly and
  take explicit `tenantId` arguments where college scoping applies.
- No function returns password hashes, session tokens, or invitation token hashes.
- Unique-constraint violations are translated to typed results (never leaked as driver errors):
  functions that can conflict return `{ ok: true, value } | { ok: false, reason: '<name>' }`.
- Every function has an integration test in `packages/db/test`, executed as the runtime role.

## 1. `@masari/db` — `src/index.ts`

### 1.1 Constants and types (`src/constants.ts`)

`ROLES`, `USER_STATUSES`, `TENANT_STATUSES`, `LOCALES`, `MODULE_KEYS`, `INVITATION_STATUSES` and the types
`Role`, `UserStatus`, `TenantStatus`, `Locale`, `ModuleKey`, `InvitationStatus` (see `data-model.md`).
Row types: `Tenant`, `TenantPublic`, `UserSummary`, `Division`, `StudentProfile`, `Invitation`,
`InvitationView` (adds `displayStatus: 'pending' | 'accepted' | 'revoked' | 'expired'`), `AuditEventInput`.

### 1.2 Context (`src/context.ts`)

```ts
export type Tx = /* Drizzle transaction type */;
/** Opens a transaction, sets app.tenant_id and app.user_id (transaction-local), runs fn, commits.
 *  Rolls back and rethrows if fn throws. tenantId must be a uuid (throws otherwise). */
export function withTenant<T>(ctx: { tenantId: string; userId: string | null }, fn: (tx: Tx) => Promise<T>): Promise<T>;
/** Opens a transaction with app.invite_token_hash set; only invitations.findByTokenHash is meaningful inside. */
export function withInvitationToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
```

### 1.3 Safety and lifecycle (`src/safety.ts`, `src/client.ts`)

```ts
export function ping(): Promise<void>;                    // SELECT 1; throws on failure
/** Throws if the connected role is superuser, has BYPASSRLS or REPLICATION, or owns a table in schema
 *  public directly or through any role membership — inherited or not, including a membership granted
 *  WITH INHERIT FALSE (the member can still SET ROLE to the owner). A table owner bypasses the non-forced
 *  RLS of `tenants`. Throws UnsafeRuntimeRoleError (exported), whose message names the problem and never
 *  a URL, so the web app's start-up check can print it; any other error (e.g. no connection) propagates. */
export function assertSafeRuntimeRole(): Promise<void>;
export function closePool(): Promise<void>;               // tests and scripts
```

### 1.4 Rate limiter (`src/rate-limit.ts`)

```ts
/** key 1–200 chars; limit integer 1–1 000 000 (always the same for a given key); windowSeconds integer
 *  1–86 400. Out-of-range values throw before the table is touched (data-model.md §3.4). */
export function hitRateLimit(key: string, opts: { limit: number; windowSeconds: number }):
  Promise<{ allowed: boolean; retryAfterSeconds: number }>;
/** Deletes counters whose window started more than olderThanSeconds ago (default 86 400 — every window in
 *  this feature is ≤ 3 600 s); returns the number of rows removed. */
export function purgeExpiredRateLimits(olderThanSeconds?: number): Promise<number>;
```

Cleanup: `hitRateLimit` calls `purgeExpiredRateLimits()` on roughly 1 in 100 calls, after its own statement,
ignoring any error from the purge (best effort; the table stays bounded without a scheduler).

### 1.5 Tokens (`src/tokens.ts`)

```ts
export function generateInvitationToken(): { token: string; tokenHash: string };  // 32 random bytes, base64url; sha256 hex
export function hashInvitationToken(token: string): string;
```

### 1.6 Repositories (`src/repositories/*.ts`, exported as namespaces)

**`tenants`** (global table)

```ts
listActivePublic(): Promise<TenantPublic[]>            // { id, slug, nameAr, nameEn } of active colleges, ordered by nameAr
findBySlug(slug: string): Promise<Tenant | null>
findById(id: string): Promise<Tenant | null>
updateSettings(tx: Tx, patch: Partial<Pick<Tenant, 'nameAr' | 'nameEn' | 'allowedEmailDomains' | 'levelsCount' | 'enabledModules'>>): Promise<Tenant>
  // updates the current tenant (RLS: only the tenant in context); sets updated_at
```

**`users`** (global table — every function below that scopes to a college takes `tenantId`)

```ts
findByEmail(email: string): Promise<UserSummary | null>                       // any college; used by auth flows
findById(id: string): Promise<UserSummary | null>
findInTenant(tenantId: string, userId: string): Promise<UserSummary | null>
listInTenant(tx: Tx, tenantId: string, filter: { q?: string; role?: Role; status?: UserStatus; page: number; pageSize: number }):
  Promise<{ rows: Array<UserSummary & { studentCode: string | null; level: number | null;
            divisionId: string | null; divisionCode: string | null; divisionNameAr: string | null; divisionNameEn: string | null }>; total: number }>
  // q matches name, email, or student code (ILIKE, wildcards escaped); ordered by created_at DESC, id
setRole(tenantId: string, userId: string, role: Role): Promise<{ from: Role; to: Role } | null>   // null = not in tenant
setStatus(tenantId: string, userId: string, status: UserStatus): Promise<boolean>
setName(userId: string, name: string): Promise<void>
setLocale(userId: string, locale: Locale): Promise<void>
activateInvited(tenantId: string, userId: string, role: Role): Promise<void>  // role + email_verified = true
deleteJustCreated(tenantId: string, userId: string): Promise<boolean>
  // compensation only (server-actions.md §4.7 step 6): deletes the user (cascade: accounts, sessions) when it
  // belongs to tenantId AND created_at > now() - interval '10 minutes'; false when nothing matched
```

`UserSummary = { id, tenantId, name, email, emailVerified, role, status, locale, createdAt }`.

**`sessions`** (global table)

```ts
revokeAllForUser(userId: string): Promise<number>     // deletes the user's sessions; returns count
revokeByToken(token: string): Promise<number>         // deletes the one session with this token (0 or 1; 0 for '');
                                                      // only the sign-in action's fallback (server-actions.md §4.3)
```

**`divisions`**

```ts
list(tx: Tx, opts?: { includeInactive?: boolean }): Promise<Division[]>       // sort_order, code
findById(tx: Tx, id: string): Promise<Division | null>
create(tx: Tx, input: { code: string; nameAr: string; nameEn: string; sortOrder: number }):
  Promise<{ ok: true; value: Division } | { ok: false; reason: 'code_taken' }>
update(tx: Tx, id: string, patch: { nameAr?: string; nameEn?: string; sortOrder?: number }): Promise<Division | null>
setActive(tx: Tx, id: string, isActive: boolean): Promise<Division | null>
```

**`studentProfiles`**

```ts
findByUserId(tx: Tx, userId: string): Promise<StudentProfile | null>
create(tx: Tx, input: { userId: string; studentCode: string; level: number; divisionId: string }):
  Promise<{ ok: true; value: StudentProfile } | { ok: false; reason: 'student_code_taken' | 'already_exists' | 'invalid_division' | 'user_not_in_tenant' }>
  // user_not_in_tenant: the account is unknown or belongs to another college (looked up in the same tx, before the insert)
update(tx: Tx, userId: string, patch: { studentCode?: string; level?: number; divisionId?: string }):
  Promise<{ ok: true; value: StudentProfile } | { ok: false; reason: 'student_code_taken' | 'not_found' | 'invalid_division' }>
  // an empty patch writes nothing (updated_at unchanged) and returns the profile, or not_found
maxLevelInUse(tx: Tx): Promise<number>                                         // 0 when the college has no profiles
```

Any other database error from `create` / `update` is thrown as `StudentProfileQueryError` (exported in the
namespace): name `StudentProfileQueryError`, `code` = the SQLSTATE, a message naming only the operation, and
no `cause` — driver and Drizzle errors quote the statement's parameters, which include the student code.

**`invitations`**

```ts
create(tx: Tx, input: { email: string; role: Role; invitedBy: string | null }):
  Promise<{ ok: true; value: Invitation; token: string } | { ok: false; reason: 'pending_exists' }>
  // revokes an expired pending invitation for the same email first; expires_at = now + 7 days
list(tx: Tx): Promise<InvitationView[]>                                        // newest first, max 200
hasUsablePending(tx: Tx, email: string): Promise<boolean>
revoke(tx: Tx, id: string): Promise<'revoked' | 'not_found' | 'not_pending'>
findByTokenHash(tx: Tx, tokenHash: string): Promise<Invitation | null>        // inside withInvitationToken
claim(tx: Tx, id: string): Promise<Invitation | null>                         // pending & unexpired → accepted (atomic)
release(tx: Tx, id: string): Promise<void>      // undo a claim not yet linked to an account (accepted_user_id IS NULL)
setAcceptedUser(tx: Tx, id: string, userId: string): Promise<void>   // throws (no data in the error) if not claimed
```

**`audit`**

```ts
record(tx: Tx, event: { actorUserId: string | null; action: string; targetType?: string; targetId?: string;
                        metadata?: Record<string, unknown>; ip?: string | null }): Promise<void>
```

## 2. `@masari/db/auth` — `src/auth.ts`

```ts
export function getAuthDb();   // lazy, memoised Drizzle instance on the runtime pool — Better Auth Drizzle adapter only
export const authSchema;       // { users, sessions, accounts, verifications } (table definitions; no connection)
```

Importing this entry point (or any other) MUST NOT read environment variables or open a connection; the pool
is created on the first call (`http-and-env.md` §3 "Parsing").

## 3. `@masari/db/admin` — `src/admin.ts` (owner connection)

```ts
export { getAdminDbEnv } from './env';                                         // lazy; for scripts and e2e support
export function withDatabaseName(url: string, databaseName: string): string;   // pure helper
export function runMigrations(migrationUrl: string): Promise<void>;
/** Creates or updates the login role named in runtimeUrl (password from the URL; NOSUPERUSER NOBYPASSRLS
 *  NOREPLICATION NOCREATEDB NOCREATEROLE INHERIT), grants it CONNECT and membership of masari_app. Idempotent.
 *  Throws before any SQL when the runtime role equals the role of migrationUrl. */
export function ensureRuntimeRole(migrationUrl: string, runtimeUrl: string): Promise<void>;
/** DROP DATABASE IF EXISTS … WITH (FORCE); CREATE DATABASE …; runMigrations; ensureRuntimeRole.
 *  Refuses names that do not match /^masari_(test|e2e)[a-z0-9_]*$/. */
export function recreateDatabase(migrationUrl: string, runtimeUrl: string, databaseName: string): Promise<void>;
// Escaping exception: role and database DDL (CREATE/ALTER ROLE … PASSWORD, GRANT, DROP/CREATE DATABASE) cannot
// use bound parameters. These two functions are the only place where values are interpolated into SQL text:
// identifiers through pg's escapeIdentifier, the password through escapeLiteral, after validating role and
// database names against /^[a-z_][a-z0-9_]{0,62}$/ (the database name also against the guard above); a name
// that fails validation throws before any SQL is sent (unit-tested).

export function createTenant(migrationUrl: string, input: { slug: string; nameAr: string; nameEn: string }):
  Promise<{ ok: true; tenantId: string } | { ok: false; reason: 'slug_taken' }>;       // + default division GEN
export function createAdminInvitation(migrationUrl: string, tenantId: string, email: string):
  Promise<{ ok: true; token: string } | { ok: false; reason: 'pending_exists' | 'email_has_account' }>;  // + audit invitation.created (actor NULL)
/** createTenant + createAdminInvitation in ONE transaction (used by `pnpm tenant:create` and the e2e operator
 *  helper): on any failure nothing is created. */
export function createTenantWithAdmin(migrationUrl: string,
  input: { slug: string; nameAr: string; nameEn: string; adminEmail: string }):
  Promise<{ ok: true; tenantId: string; token: string } | { ok: false; reason: 'slug_taken' | 'email_has_account' }>;
export function setTenantStatus(migrationUrl: string, slug: string, status: TenantStatus):
  Promise<'updated' | 'not_found'>;                                                     // changes status only; sessions are NOT deleted (cli.md §5)
export function seedDemo(migrationUrl: string): Promise<{ tenantId: string; adminInvitationToken: string | null }>;

// Test support (src/admin/test-support.ts) — used only by packages/db/test and apps/web/e2e
export function getUserByEmail(migrationUrl: string, email: string):
  Promise<(UserSummary & { privacyConsentAt: Date | null }) | null>;
export function countAuditEvents(migrationUrl: string, tenantSlug: string, action: string): Promise<number>;
export function countSessionsByEmail(migrationUrl: string, email: string): Promise<number>;   // 0 for an unknown email
/** Deletes rate-limit counters whose key starts with keyPrefix (default: all) → rows removed. Refuses (before
 *  connecting) a database whose name does not match /^masari_(test|e2e)[a-z0-9_]*$/. e2e global setup. */
export function resetRateLimits(migrationUrl: string, keyPrefix?: string): Promise<number>;
/** e2e fixture: the account with this email gets an academic profile in its college (level default 1, division by
 *  code, default its first ACTIVE one by sort order); no audit row. Throws for an unknown email or division;
 *  refuses (before connecting) a database that is not masari_(test|e2e)…. Signed-in specs that are not about
 *  onboarding. */
export function createStudentProfile(migrationUrl: string, email: string,
  input: { studentCode: string; level?: number; divisionCode?: string }): Promise<void>;
/** The stored profile of the account with this email (division by code), or null. e2e before/after checks. */
export function getStudentProfileByEmail(migrationUrl: string, email: string):
  Promise<{ studentCode: string; level: number; divisionCode: string } | null>;
/** e2e fixture until the divisions screen exists: adds a division (sortOrder default 0, isActive default true);
 *  no audit row; refuses (before connecting) a database that is not masari_(test|e2e)…. */
export function addDivision(migrationUrl: string, tenantId: string,
  input: { code: string; nameAr: string; nameEn: string; sortOrder?: number; isActive?: boolean }): Promise<void>;
export function expireInvitation(migrationUrl: string, email: string): Promise<void>;   // sets expires_at to the past
```

All `admin` functions that write tenant-scoped rows set the tenant context exactly like `withTenant` does.

## 4. Required integration tests (`packages/db/test/*.int.test.ts`)

| File | Proves |
|---|---|
| `context.int.test.ts` | Settings are transaction-local (no leak to the next query on the same connection); without context, tenant-scoped tables return zero rows and reject inserts; invalid uuid is rejected. |
| `safety.int.test.ts` | `assertSafeRuntimeRole` passes for the runtime role and throws for the owner; `ping` works. |
| `tenants.int.test.ts` | Public listing hides suspended colleges; `updateSettings` changes only the current college; runtime role cannot insert/delete colleges nor update `slug`/`status`. |
| `rls-meta.int.test.ts` | Every `public` table is classified; every tenant-scoped table has `tenant_id NOT NULL`, RLS enabled + forced, and a `tenant_isolation` policy; the runtime role owns nothing and has no privileges beyond `data-model.md` §1. |
| `divisions.int.test.ts` | CRUD; duplicate code per college refused, same code in two colleges allowed; college A cannot read/update college B's divisions (by id). |
| `audit.int.test.ts` | Insert + read within the college; `UPDATE`/`DELETE` denied; cross-college invisible. PR-5 uses `actorUserId: null` only (no `users` table yet); from PR-12: a real user as actor is stored, an unknown actor id is rejected by the FK. |
| `rate-limit.int.test.ts` | Counts, refuses over the limit with a positive `retryAfterSeconds`, resets after the window (window passed as 1 s), concurrent hits are atomic; `purgeExpiredRateLimits` removes only counters older than the given age. |
| `users.int.test.ts` | Tenant filter on every scoped function (cross-college `setRole`/`setStatus`/`findInTenant` → null/false); search escapes `%` and `_`; pagination and totals; `activateInvited`; `deleteJustCreated` removes a fresh user of that college with its accounts/sessions and refuses another college's user and a user older than 10 minutes. |
| `sessions.int.test.ts` | `revokeAllForUser` deletes only that user's sessions; `revokeByToken` deletes only the session with that token. |
| `student-profiles.int.test.ts` | Unique code per college (and concurrent creates → exactly one wins); same code in two colleges (create and update); division from another college → `invalid_division`; account from another college → `user_not_in_tenant`; empty update patch; unexpected errors never carry the code; cross-college invisibility; `maxLevelInUse`. |
| `invitations.int.test.ts` | One pending per email; expired pending replaced; token lookup works only with the matching hash and returns nothing for other tokens; concurrent `claim` → exactly one succeeds; `release`; `revoke` states; cross-college invisibility. |
| `auth-schema.int.test.ts` | Defaults `student`/`active`/`ar`; upper-case email, unknown role, and missing tenant rejected; deleting a user cascades to sessions and accounts and sets `audit_events.actor_user_id` to NULL. |
| `cli.int.test.ts` | `tenant-create` and `tenant-set-status` scripts: outputs and exit codes of `cli.md` §4–5; nothing changes on failure. |
| `admin.int.test.ts` | `createTenant` defaults + `GEN` division; duplicate slug; `createAdminInvitation`; `createTenantWithAdmin` is atomic (`email_has_account` → no college, no division); `setTenantStatus` changes the status and leaves session rows in place; `seedDemo` is idempotent. |
