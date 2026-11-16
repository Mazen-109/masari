# Data Model: Platform Foundation

**Feature**: `001-platform-foundation` · **Date**: 2026-11-14 · **Phase**: 1 (speckit-plan)
**Database**: PostgreSQL 16+ · **Owner of this model in code**: `packages/db` (`@masari/db`)

Conventions

- SQL names are `snake_case`; TypeScript properties are `camelCase` (Drizzle maps them).
- All timestamps are `timestamptz`, default `now()`. `updated_at` is set by the repository on every update.
- Masari tables use `uuid` primary keys (`gen_random_uuid()`); auth-library tables use `text` IDs.
- "Runtime role" = group role `masari_app` (the web app's login role is a member). The owner role runs
  migrations and operator scripts only.
- Enumerations are `text` columns with `CHECK` constraints (no PostgreSQL enum types — easier forward-only
  migrations). The TypeScript source of truth is `packages/db/src/constants.ts`:

  ```ts
  export const ROLES = ['student', 'faculty', 'student_affairs', 'admin'] as const;
  export const USER_STATUSES = ['active', 'suspended'] as const;
  export const TENANT_STATUSES = ['active', 'suspended'] as const;
  export const LOCALES = ['ar', 'en'] as const;
  export const MODULE_KEYS = ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'] as const;
  export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const;
  ```

## 1. Table classification

Every table in schema `public` MUST be listed in `packages/db/src/table-classification.ts`; a meta-test
fails otherwise.

| Table | Class | RLS | Runtime-role privileges |
|---|---|---|---|
| `tenants` | global (tenant registry) | enabled (not forced): select all, update own | `SELECT`; `UPDATE (name_ar, name_en, allowed_email_domains, levels_count, enabled_modules, updated_at)` |
| `users` | global (auth library) | none | `SELECT, INSERT, UPDATE, DELETE` |
| `sessions` | global (auth library) | none | `SELECT, INSERT, UPDATE, DELETE` |
| `accounts` | global (auth library) | none | `SELECT, INSERT, UPDATE, DELETE` |
| `verifications` | global (auth library) | none | `SELECT, INSERT, UPDATE, DELETE` |
| `rate_limit_counters` | global (infrastructure) | none | `SELECT, INSERT, UPDATE, DELETE` |
| `divisions` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE` |
| `student_profiles` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE` |
| `invitations` | tenant-scoped | enabled + forced, `tenant_isolation` + `invitation_token_lookup` | `SELECT, INSERT, UPDATE` |
| `audit_events` | tenant-scoped, append-only | enabled + forced, `tenant_isolation` | `SELECT, INSERT` |

The runtime role never receives `TRUNCATE`, `REFERENCES`, `TRIGGER`, or DDL rights, and owns no table.

**Why `users` is not under RLS**: the auth library must find a user by email and a session by token before
any tenant is known. Compensating controls (all tested): only `packages/db/src/repositories/users.ts` and
`sessions.ts` query these tables outside the auth library; every function that lists or mutates users takes
`tenantId` and filters on it; the web app cannot import the raw database handle (lint rule).

## 2. Bootstrap objects (first migration, custom SQL)

```sql
-- group role that receives all runtime grants (no password, cannot log in)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'masari_app') THEN
    CREATE ROLE masari_app NOLOGIN;
  END IF;
END $$;

-- current tenant from the transaction-local setting; NULL when unset or empty (fail closed)
CREATE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
```

Transaction-local settings used by the application (set with `set_config(name, value, true)`):

| Setting | Set by | Meaning |
|---|---|---|
| `app.tenant_id` | `withTenant` | current college (uuid) |
| `app.user_id` | `withTenant` | acting user id or empty (system/anonymous) — informational, for future policies |
| `app.invite_token_hash` | `withInvitationToken` | SHA-256 hex of an invitation token being looked up |

Standard policy for every tenant-scoped table `T`:

```sql
ALTER TABLE T ENABLE ROW LEVEL SECURITY;
ALTER TABLE T FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON T
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT <privileges from the table above> ON T TO masari_app;
```

## 3. Entities

### 3.1 `tenants` — a college

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `slug` | text | NOT NULL, UNIQUE, `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40)` |
| `name_ar` | text | NOT NULL, `CHECK (char_length(name_ar) BETWEEN 1 AND 120)` |
| `name_en` | text | NOT NULL, `CHECK (char_length(name_en) BETWEEN 1 AND 120)` |
| `status` | text | NOT NULL, default `'active'`, `CHECK (status IN ('active','suspended'))` |
| `allowed_email_domains` | text[] | NOT NULL, default `'{}'`, `CHECK (cardinality(allowed_email_domains) <= 20)` |
| `levels_count` | smallint | NOT NULL, default `4`, `CHECK (levels_count BETWEEN 1 AND 7)` |
| `enabled_modules` | text[] | NOT NULL, default all six keys, `CHECK (enabled_modules <@ ARRAY['mueed','codejudge','mizan','kitabi','careermap','tadreeb'])` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

RLS: `ENABLE` (not forced). Policies for `masari_app`: `tenants_select FOR SELECT USING (true)`;
`tenants_update FOR UPDATE USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id())`. No insert/delete
policy or grant: colleges are created and suspended only by operator scripts (owner connection).

Validation (application, `features/tenant-settings/schemas.ts`):

- `allowed_email_domains`: each item lower-cased, trimmed, matches
  `^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$`, de-duplicated, max 20.
- `levels_count`: integer 1–7 and ≥ the highest `student_profiles.level` in the college (FR-032).
- `enabled_modules`: subset of `MODULE_KEYS`, de-duplicated, stored in registry order.

State: `active ⇄ suspended` (operator only). Suspending changes `status` only and does **not** delete
sessions: every request re-reads the college status, so existing sessions are refused with the "college
suspended" reason while it is suspended (FR-019) and work again after reactivation.

### 3.2 `users` — an account (Better Auth `user` model + Masari columns)

Columns created by the auth library (exact set per pinned version): `id text PK`, `name text NOT NULL`,
`email text NOT NULL UNIQUE`, `email_verified boolean NOT NULL default false`, `image text NULL` (unused),
`created_at`, `updated_at`.

Masari columns (declared as Better Auth `additionalFields` and present in the Drizzle schema):

| Column | Type | Constraints / default | Settable at creation through auth API |
|---|---|---|---|
| `tenant_id` | uuid | NOT NULL, FK → `tenants(id)` ON DELETE RESTRICT | yes (server code only) |
| `role` | text | NOT NULL, default `'student'`, `CHECK (role IN ('student','faculty','student_affairs','admin'))` | **no** (`input: false`) |
| `status` | text | NOT NULL, default `'active'`, `CHECK (status IN ('active','suspended'))` | **no** (`input: false`) |
| `locale` | text | NOT NULL, default `'ar'`, `CHECK (locale IN ('ar','en'))` | yes |
| `privacy_consent_at` | timestamptz | NULL (set at registration / invitation acceptance) | yes |

Extra constraints: `CHECK (email = lower(email))`; `CHECK (char_length(name) BETWEEN 2 AND 100)`.
Indexes: `users_tenant_role_idx (tenant_id, role)`; `users_tenant_created_idx (tenant_id, created_at DESC)`.

State: `status active ⇄ suspended` (administrator, never self). Role changes: any → any (administrator,
never self). A user is never deleted in this feature, with one technical exception: the compensation step
of invitation acceptance removes the account it created seconds earlier when a later step fails
(`users.deleteJustCreated`, `contracts/server-actions.md` §4.7).

### 3.3 `sessions`, `accounts`, `verifications` — auth library tables

Generated by the Better Auth CLI for the pinned version; not hand-edited except: `sessions.user_id` and
`accounts.user_id` are `FK → users(id) ON DELETE CASCADE`; index `sessions_user_id_idx (user_id)`.
`accounts.password` holds the password hash (library default memory-hard algorithm). `verifications` holds
the library's stored one-time values with expiry — in this feature the password-reset tokens.

Email-confirmation links are different: in Better Auth 1.x the confirmation token is a signed, stateless
value (signed with `BETTER_AUTH_SECRET`, 24 h expiry) and is **not** a row in `verifications` (check on the
pinned version; record a Spec deviation if it differs). Consequences: a confirmation link stays valid until
it expires and can be opened more than once (the spec's "same link twice shows success both times"); it
cannot be revoked individually; rotating `BETTER_AUTH_SECRET` invalidates all outstanding links.

Known limitation (accepted for this feature): confirmation is a GET link, and some mail scanners open
links automatically, which would confirm an address its owner never clicked — weakening the allowed-domain
gate of FR-003 for mailboxes behind such scanners. Confirming does not sign anyone in (spec D5), so the
exposure is a confirmed-but-unused account. A "press the button to confirm" step (link → page → POST) is a
candidate for feature 009 and is decided in its plan.

### 3.4 `rate_limit_counters` — fixed-window counters

| Column | Type | Constraints |
|---|---|---|
| `key` | text | PK, `CHECK (char_length(key) <= 200)` |
| `window_start` | timestamptz | NOT NULL |
| `count` | integer | NOT NULL, `CHECK (count >= 0)` |

Semantics of `hitRateLimit(key, { limit, windowSeconds })` — one atomic statement:
insert `(key, now(), 1)`; on conflict, if `window_start + windowSeconds <= now()` reset to `(now(), 1)`,
else `count = count + 1`; return `allowed = count <= limit` and `retryAfterSeconds` (seconds until the window
ends, 0 when allowed). Keys contain a purpose prefix and a SHA-256 hash of the email or the IP (no raw
personal data in this table), e.g. `signin:email:<sha256>`.

Cleanup: rows are never needed after their window ends. `purgeExpiredRateLimits()` deletes counters whose
`window_start` is older than 24 hours; `hitRateLimit` calls it on about 1 in 100 calls (best effort, errors
ignored), so the table stays bounded without a scheduler (`contracts/db-api.md` §1.4).

### 3.5 `divisions` — specialisation tracks (tenant-scoped)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` ON DELETE RESTRICT |
| `code` | text | NOT NULL, `CHECK (code ~ '^[A-Z0-9_-]{1,16}$')` |
| `name_ar` | text | NOT NULL, `CHECK (char_length(name_ar) BETWEEN 1 AND 80)` |
| `name_en` | text | NOT NULL, `CHECK (char_length(name_en) BETWEEN 1 AND 80)` |
| `is_active` | boolean | NOT NULL, default `true` |
| `sort_order` | integer | NOT NULL, default `0`, `CHECK (sort_order BETWEEN 0 AND 9999)` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints: `UNIQUE (tenant_id, code)`; `UNIQUE (tenant_id, id)` (target of the composite FK below).
Ordering everywhere: `sort_order ASC, code ASC`. `code` is immutable after creation. No delete.
State: `is_active true ⇄ false`.

### 3.6 `student_profiles` — academic profile (tenant-scoped; first part of the shared student profile)

| Column | Type | Constraints / default |
|---|---|---|
| `user_id` | text | PK, FK → `users(id)` ON DELETE CASCADE |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` ON DELETE RESTRICT |
| `student_code` | text | NOT NULL, `CHECK (student_code ~ '^[A-Za-z0-9-]{3,20}$')` |
| `level` | smallint | NOT NULL, `CHECK (level BETWEEN 1 AND 7)` |
| `division_id` | uuid | NOT NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints: `UNIQUE (tenant_id, student_code)`;
`FOREIGN KEY (tenant_id, division_id) REFERENCES divisions (tenant_id, id) ON DELETE RESTRICT` (a profile can
never point at another college's division).

Validation (application, `features/profile/rules.ts` + schemas):

- `student_code`: trimmed, pattern above; uniqueness violation → field error `student_code_taken`.
- `level`: integer, `1 ≤ level ≤ tenants.levels_count`.
- `division_id`: an active division of the college, or the profile's current division when editing.
- Only users with role `student` may have a profile created through the UI; the profile row is kept if the
  role later changes.
- The student sets `student_code` once (create); afterwards only an administrator changes it (FR-025/028).

Later features extend the shared profile with their own tenant-scoped tables keyed by `(tenant_id,
user_id)` (courses, grades, skills, weak points); they do not add columns here.

### 3.7 `invitations` (tenant-scoped)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` ON DELETE RESTRICT |
| `email` | text | NOT NULL, `CHECK (email = lower(email))` |
| `role` | text | NOT NULL, `CHECK (role IN ('student','faculty','student_affairs','admin'))` |
| `token_hash` | text | NOT NULL, UNIQUE (SHA-256 hex of the token; the token itself is never stored) |
| `status` | text | NOT NULL, default `'pending'`, `CHECK (status IN ('pending','accepted','revoked'))` |
| `expires_at` | timestamptz | NOT NULL (creation time + 7 days) |
| `invited_by` | text | NULL, FK → `users(id)` ON DELETE SET NULL (NULL = created by the operator tool) |
| `accepted_user_id` | text | NULL, FK → `users(id)` ON DELETE SET NULL |
| `accepted_at` | timestamptz | NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

Constraints: partial unique index `invitations_one_pending_per_email ON (tenant_id, email) WHERE status =
'pending'`. Index `invitations_tenant_created_idx (tenant_id, created_at DESC)`.

Additional policy (anonymous lookup by token — knowing the token is the capability):

```sql
CREATE POLICY invitation_token_lookup ON invitations FOR SELECT
  USING (token_hash = nullif(current_setting('app.invite_token_hash', true), ''));
```

Derived display status: `expired` = `status = 'pending' AND expires_at <= now()`.

State transitions:

```text
pending ──accept (token valid, not expired; atomic claim)──► accepted   (terminal)
pending ──revoke (administrator) or superseded by a new invitation after expiry──► revoked (terminal)
```

Rules: an invitation cannot be created when a `users` row with that email exists (any college) or a
non-expired pending invitation for `(tenant_id, email)` exists; an expired pending invitation for the same
email is set to `revoked` before the new one is inserted. Acceptance claims with
`UPDATE … SET status='accepted', accepted_at=now() WHERE id=$1 AND status='pending' AND expires_at > now()
RETURNING …` so two simultaneous submissions create one account; if a later step fails, the account
created for it (if any) is deleted and the claim is released (`status='pending'`, `accepted_at=NULL`), so
the invitation can be used again.

### 3.8 `audit_events` (tenant-scoped, append-only)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` ON DELETE RESTRICT |
| `actor_user_id` | text | NULL, FK → `users(id)` ON DELETE SET NULL (NULL = system/operator) |
| `action` | text | NOT NULL, `CHECK (char_length(action) <= 64)` |
| `target_type` | text | NULL (`'user' \| 'invitation' \| 'division' \| 'tenant' \| 'student_profile'`) |
| `target_id` | text | NULL |
| `metadata` | jsonb | NOT NULL, default `'{}'` |
| `ip` | text | NULL (client IP as seen by the server; `NULL` when unknown) |
| `created_at` | timestamptz | NOT NULL, default `now()` |

Index: `audit_events_tenant_created_idx (tenant_id, created_at DESC)`. The runtime role has no `UPDATE` or
`DELETE` privilege (append-only; tested).

Migration order: `audit_events` is created in PR-5, before `users` exists (PR-12). PR-5 therefore creates
`actor_user_id text NULL` **without** the foreign key; PR-12's migration adds
`audit_events_actor_user_id_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL` (the
table holds only `NULL` actors at that point) and adds the reference to the Drizzle schema of
`audit-events.ts`. The owner's `ON DELETE SET NULL` update is not blocked by the runtime role's missing
`UPDATE` privilege or by row-level security (referential actions run with the table owner's rights and
bypass RLS); `auth-schema.int.test.ts` proves it.

`recordAudit` (web) accepts only actions from the catalogue below and rejects any string metadata value
longer than 64 characters.

Action catalogue (the only values written in this feature; `metadata` keys in braces — IDs and
enumerations only, never emails, names, tokens, or passwords):

| Action | Actor | Target | Metadata |
|---|---|---|---|
| `user.registered` | the new user | user | `{}` |
| `auth.sign_in` | user | user | `{}` |
| `auth.sign_out` | user | user | `{}` |
| `auth.password_reset_requested` | user (the account's owner) | user | `{}` |
| `auth.password_reset` | user | user | `{}` |
| `invitation.created` | admin or NULL (operator) | invitation | `{ role }` |
| `invitation.revoked` | admin | invitation | `{}` |
| `invitation.accepted` | the new user | invitation | `{ role }` |
| `user.role_changed` | admin | user | `{ from, to }` |
| `user.suspended` / `user.reactivated` | admin | user | `{}` |
| `profile.created` | student | student_profile | `{}` |
| `profile.updated` | student or admin | student_profile | `{ fields: string[] }` |
| `tenant.settings_updated` | admin | tenant | `{ fields: string[] }` |
| `tenant.modules_updated` | admin | tenant | `{ enabled: string[] }` |
| `division.created` / `division.updated` | admin | division | `{ fields?: string[] }` |
| `division.activated` / `division.deactivated` | admin | division | `{}` |

## 4. Relationships

```text
tenants 1 ──< users            (users.tenant_id; exactly one college per user)
tenants 1 ──< divisions
tenants 1 ──< invitations
tenants 1 ──< audit_events
users   1 ──0..1 student_profiles   (role = student)
divisions 1 ──< student_profiles    (composite FK keeps both in the same tenant)
users   1 ──< sessions, accounts    (auth library)
users   1 ──< invitations.invited_by / accepted_user_id (nullable)
```

## 5. Seed and default data

- **New college** (operator tool): default settings (4 levels, all modules, no domain restriction) and one
  division `GEN` — «عام» / "General"; plus one pending `admin` invitation.
- **Demo college** (`pnpm db:seed`, idempotent): slug `demo`, «كلية الحاسبات والذكاء الاصطناعي (تجريبي)» /
  "Faculty of Computers and AI (Demo)", divisions `GEN` «عام»/General (0), `CS` «علوم الحاسب»/Computer
  Science (10), `IS` «نظم المعلومات»/Information Systems (20), `IT` «تكنولوجيا المعلومات»/Information
  Technology (30), `AI` «الذكاء الاصطناعي»/Artificial Intelligence (40). From PR-26 on, the seed also
  ensures a pending admin invitation for `admin@demo.masari.test` when the college has no administrator and
  prints its link. The seed never creates passwords.

## 6. Requirement traceability

| Entity / rule | Requirements |
|---|---|
| `tenants` + RLS model + roles | FR-017, FR-018, FR-019, FR-032, FR-034 |
| `users` columns and constraints | FR-001, FR-006, FR-007, FR-011, FR-012, FR-013, FR-030, FR-031, FR-037 |
| `sessions`, `verifications` | FR-004, FR-008, FR-010 |
| `rate_limit_counters` | FR-009 |
| `divisions` | FR-026, FR-033 |
| `student_profiles` | FR-024–FR-028 |
| `invitations` | FR-020–FR-023 |
| `audit_events` | FR-044 |
