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
/** Throws if the connected role is superuser or has BYPASSRLS. */
export function assertSafeRuntimeRole(): Promise<void>;
export function closePool(): Promise<void>;               // tests and scripts
```

### 1.4 Rate limiter (`src/rate-limit.ts`)

```ts
export function hitRateLimit(key: string, opts: { limit: number; windowSeconds: number }):
  Promise<{ allowed: boolean; retryAfterSeconds: number }>;
```

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
```

`UserSummary = { id, tenantId, name, email, emailVerified, role, status, locale, createdAt }`.

**`sessions`** (global table)

```ts
revokeAllForUser(userId: string): Promise<number>     // deletes the user's sessions; returns count
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
  Promise<{ ok: true; value: StudentProfile } | { ok: false; reason: 'student_code_taken' | 'already_exists' | 'invalid_division' }>
update(tx: Tx, userId: string, patch: { studentCode?: string; level?: number; divisionId?: string }):
  Promise<{ ok: true; value: StudentProfile } | { ok: false; reason: 'student_code_taken' | 'not_found' | 'invalid_division' }>
maxLevelInUse(tx: Tx): Promise<number>                                         // 0 when the college has no profiles
```

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
release(tx: Tx, id: string): Promise<void>                                    // undo claim
setAcceptedUser(tx: Tx, id: string, userId: string): Promise<void>
```

**`audit`**

```ts
record(tx: Tx, event: { actorUserId: string | null; action: string; targetType?: string; targetId?: string;
                        metadata?: Record<string, unknown>; ip?: string | null }): Promise<void>
```

## 2. `@masari/db/auth` — `src/auth.ts`

```ts
export const authDb;       // Drizzle instance on the runtime pool, for the Better Auth Drizzle adapter only
export const authSchema;   // { users, sessions, accounts, verifications }
```

## 3. `@masari/db/admin` — `src/admin.ts` (owner connection)

```ts
export function withDatabaseName(url: string, databaseName: string): string;   // pure helper
export function runMigrations(migrationUrl: string): Promise<void>;
/** Creates or updates the login role named in runtimeUrl (password from the URL; NOSUPERUSER NOBYPASSRLS
 *  NOCREATEDB NOCREATEROLE INHERIT), grants it CONNECT and membership of masari_app. Idempotent. */
export function ensureRuntimeRole(migrationUrl: string, runtimeUrl: string): Promise<void>;
/** DROP DATABASE IF EXISTS … WITH (FORCE); CREATE DATABASE …; runMigrations; ensureRuntimeRole.
 *  Refuses names that do not match /^masari_(test|e2e)[a-z0-9_]*$/. */
export function recreateDatabase(migrationUrl: string, runtimeUrl: string, databaseName: string): Promise<void>;

export function createTenant(migrationUrl: string, input: { slug: string; nameAr: string; nameEn: string }):
  Promise<{ ok: true; tenantId: string } | { ok: false; reason: 'slug_taken' }>;       // + default division GEN
export function createAdminInvitation(migrationUrl: string, tenantId: string, email: string):
  Promise<{ ok: true; token: string } | { ok: false; reason: 'pending_exists' | 'email_has_account' }>;  // + audit invitation.created (actor NULL)
export function setTenantStatus(migrationUrl: string, slug: string, status: TenantStatus):
  Promise<'updated' | 'not_found'>;                                                     // suspending deletes the college's sessions
export function seedDemo(migrationUrl: string): Promise<{ tenantId: string; adminInvitationToken: string | null }>;
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
| `audit.int.test.ts` | Insert + read within the college; `UPDATE`/`DELETE` denied; cross-college invisible. |
| `rate-limit.int.test.ts` | Counts, refuses over the limit with a positive `retryAfterSeconds`, resets after the window (window passed as 1 s), concurrent hits are atomic. |
| `users.int.test.ts` | Tenant filter on every scoped function (cross-college `setRole`/`setStatus`/`findInTenant` → null/false); search escapes `%` and `_`; pagination and totals; `activateInvited`. |
| `sessions.int.test.ts` | `revokeAllForUser` deletes only that user's sessions. |
| `student-profiles.int.test.ts` | Unique code per college (and concurrent creates → exactly one wins); same code in two colleges; division from another college → `invalid_division`; cross-college invisibility; `maxLevelInUse`. |
| `invitations.int.test.ts` | One pending per email; expired pending replaced; token lookup works only with the matching hash and returns nothing for other tokens; concurrent `claim` → exactly one succeeds; `release`; `revoke` states; cross-college invisibility. |
| `admin.int.test.ts` | `createTenant` defaults + `GEN` division; duplicate slug; `createAdminInvitation`; `setTenantStatus` deletes sessions; `seedDemo` is idempotent. |
