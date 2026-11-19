# Data Model: Academic Catalog & Student Roster

**Feature**: `002-academic-catalog` · **Date**: 2026-11-19 · **Phase**: 1 (speckit-plan)
**Database**: PostgreSQL 16+ · **Owner of this model in code**: `packages/db` (`@masari/db`)

All conventions of feature 001's data model apply unchanged (`specs/001-platform-foundation/data-model.md`
"Conventions" and §2): `snake_case` SQL, `uuid` primary keys, `timestamptz` timestamps, enumerations as
`text` + `CHECK`, every tenant-scoped table with `tenant_id uuid NOT NULL DEFAULT app_tenant_id()` →
`tenants(id) ON DELETE RESTRICT`, RLS **enabled and forced** with the standard `tenant_isolation` policy,
explicit grants to `masari_app`, an entry in `packages/db/src/table-classification.ts`, and a cross-college
integration test — all in the same PR as the table (constitution III, CLAUDE.md).

New constants in `packages/db/src/constants.ts`:

```ts
export const TERM_KINDS = ['first', 'second', 'summer'] as const;          // academic_terms.kind
export const PLAN_TERM_KINDS = ['first', 'second'] as const;               // course_placements.term_kind
export const ROSTER_IMPORT_STATUSES = ['draft', 'applied', 'discarded', 'expired'] as const;
export const VERIFICATION_METHODS = ['auto', 'manual'] as const;
export const VERIFICATION_STATUSES = ['verified', 'name_mismatch', 'not_in_roster', 'not_registered'] as const;
export const COURSE_LIMITS = { maxTopics: 50, maxTeachersPerTerm: 10 } as const;
export const ROSTER_LIMITS = { maxFileBytes: 2 * 1024 * 1024, maxRows: 10_000, maxListedIssues: 500,
                               draftHours: 24, upsertChunk: 1_000 } as const;
```

## 1. Table classification (additions)

| Table | Class | RLS | Runtime-role privileges |
|---|---|---|---|
| `academic_terms` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE` |
| `courses` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE` |
| `course_topics` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE, DELETE` |
| `course_placements` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, DELETE` |
| `course_teachers` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, DELETE` |
| `roster_imports` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE` |
| `roster_entries` | tenant-scoped | enabled + forced, `tenant_isolation` | `SELECT, INSERT, UPDATE, DELETE` |

No new global table. Terms, courses, and imports are never deleted (no `DELETE` grant); topics,
placements, teacher assignments, and official-list entries are.

Changed 001 table: `student_profiles` gains `UNIQUE (user_id, student_code)` (constraint
`student_profiles_user_code_unique`), the target of the verification foreign key in §3.7. No column is
added (001 data-model §3.6: later features extend the profile with their own tables).

## 2. Lock and ordering rules shared by the repositories

- **Roster lock**: every write to `roster_imports` or `roster_entries` (upload, discard, apply, purge,
  automatic verification of one profile, manual confirmation, undo) first takes
  `pg_advisory_xact_lock(hashtextextended('masari.roster:' || app_tenant_id()::text, 0))`, so roster writes of
  one college are serialised and writes of different colleges never wait for each other.
- **Course touch**: every write to a course's topics or placements also sets that course's `updated_at = now()`
  in the same transaction (the regulations assistant re-reads changed courses by `updated_at`,
  contracts/catalog-read.md §2.11).
- **Current term**: `setCurrent` locks the college's terms (`SELECT id FROM academic_terms FOR UPDATE`), then
  `UPDATE … SET is_current = false WHERE is_current`, then sets the chosen term (research.md §12).

## 3. Entities

### 3.1 `academic_terms` — a term of an academic year

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` ON DELETE RESTRICT |
| `start_year` | smallint | NOT NULL, `CHECK (start_year BETWEEN 2000 AND 2100)` — `2026` means `2026/2027` |
| `kind` | text | NOT NULL, `CHECK (kind IN ('first','second','summer'))` |
| `starts_on` | date | NOT NULL |
| `ends_on` | date | NOT NULL, `CHECK (ends_on > starts_on)` |
| `is_current` | boolean | NOT NULL, default `false` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints: `UNIQUE (tenant_id, start_year, kind)` (`academic_terms_year_kind_unique`);
`UNIQUE (tenant_id, id)` (target of composite FKs); partial unique index
`academic_terms_one_current ON (tenant_id) WHERE is_current`.
Ordering everywhere: `start_year DESC`, then kind `summer`, `second`, `first`.
Display: «الفصل الدراسي الأول 2026/2027» / "First term 2026/2027"; the year is rendered in an LTR isolate.
State: `is_current false ⇄ true` (exactly through `setCurrent`). No delete.

### 3.2 `courses` — the college's course catalog

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `code` | text | NOT NULL, `CHECK (code = btrim(code) AND char_length(code) BETWEEN 2 AND 20)` |
| `name_ar` | text | NOT NULL, `CHECK (char_length(name_ar) BETWEEN 1 AND 120)` |
| `name_en` | text | NOT NULL, `CHECK (char_length(name_en) BETWEEN 1 AND 120)` |
| `credit_hours` | smallint | NOT NULL, `CHECK (credit_hours BETWEEN 0 AND 12)` |
| `description` | text | NOT NULL, default `''`, `CHECK (char_length(description) <= 4000)` |
| `is_active` | boolean | NOT NULL, default `true` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints: `UNIQUE (tenant_id, code)` (`courses_tenant_code_unique`); `UNIQUE (tenant_id, id)`.
Index: `courses_tenant_active_code_idx (tenant_id, is_active, code)`.

Validation (application, `features/courses/schemas.ts` + `rules.ts`):

- `code`: `normalizeCourseCode` — trim, inner whitespace → one space, Arabic-Indic digits → Western, Latin
  letters upper-cased; then 2–20 characters matching
  `^[\p{L}\p{N}](?:[\p{L}\p{N} .-]{0,18}[\p{L}\p{N}])?$` (u flag). Uniqueness violation → `code_taken`.
- `description`: trimmed; line breaks kept; rendered as text with `dir="auto"` and `whitespace-pre-line`.

State: `is_active true ⇄ false`. No delete.

### 3.3 `course_topics` — ordered topics of a course

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `course_id` | uuid | NOT NULL |
| `position` | smallint | NOT NULL, `CHECK (position BETWEEN 1 AND 50)` |
| `title` | text | NOT NULL, `CHECK (char_length(title) BETWEEN 1 AND 200)` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints: `FOREIGN KEY (tenant_id, course_id) REFERENCES courses (tenant_id, id) ON DELETE RESTRICT`;
`UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED` (`course_topics_course_position_unique`,
written in the custom security migration because the ORM schema may not express deferrability).

Rules (repository): positions are always `1…n` without gaps. Add = lock the course row `FOR UPDATE`,
refuse when `n = 50` (`too_many`), insert at `n + 1`. Move up/down = swap with the neighbour (no-op at the
edge). Remove = delete, then `position - 1` for every later topic. Each write touches the course (§2).

### 3.4 `course_placements` — study-plan placement (course × level × division × term kind)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `course_id` | uuid | NOT NULL |
| `level` | smallint | NOT NULL, `CHECK (level BETWEEN 1 AND 7)` |
| `division_id` | uuid | NOT NULL |
| `term_kind` | text | NOT NULL, `CHECK (term_kind IN ('first','second'))` |
| `created_at` | timestamptz | NOT NULL, default `now()` |

Constraints: FK `(tenant_id, course_id)` → `courses (tenant_id, id)` RESTRICT; FK `(tenant_id, division_id)`
→ `divisions (tenant_id, id)` RESTRICT; `UNIQUE (tenant_id, course_id, level, division_id, term_kind)`
(`course_placements_unique`). Index `course_placements_group_idx (tenant_id, level, division_id, term_kind)`.

Validation: `level ≤ tenants.levels_count`; the division is active when the placement is added (an existing
placement keeps working if its division is later deactivated). Adding an existing placement is a no-op
(`INSERT … ON CONFLICT DO NOTHING`), reported back as "already existed".

### 3.5 `course_teachers` — a faculty member teaching a course in a term

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `term_id` | uuid | NOT NULL |
| `course_id` | uuid | NOT NULL |
| `user_id` | text | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `assigned_by` | text | NULL, FK → `users(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

Constraints: FK `(tenant_id, term_id)` → `academic_terms (tenant_id, id)` RESTRICT; FK `(tenant_id, course_id)`
→ `courses (tenant_id, id)` RESTRICT; `UNIQUE (tenant_id, term_id, course_id, user_id)`
(`course_teachers_unique`). Index `course_teachers_user_idx (tenant_id, term_id, user_id)`.

Rules (repository `teaching.assign`, in one transaction): the course is active (else `course_inactive`);
the user belongs to the college, has role `faculty`, and is `active` — read with
`users.lockMemberInTenant(tx, tenantId, userId)` (`FOR SHARE`, else `invalid_teacher`); fewer than 10
teachers for (term, course) (else `too_many`, checked after locking the course row `FOR UPDATE`); an existing
assignment is a no-op. The `users` foreign key does not check the college (`users` is global); the
repository check above does, and an integration test proves a user of another college is refused.

### 3.6 `roster_imports` — one uploaded official list (draft → applied / discarded / expired)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `status` | text | NOT NULL, default `'draft'`, `CHECK (status IN ('draft','applied','discarded','expired'))` |
| `uploaded_by` | text | NULL, FK → `users(id)` ON DELETE SET NULL |
| `resolved_by` | text | NULL, FK → `users(id)` ON DELETE SET NULL (who applied or discarded; NULL for expiry) |
| `row_count` | integer | NOT NULL, `CHECK (row_count BETWEEN 0 AND 10000)` |
| `issue_count` | integer | NOT NULL, `CHECK (issue_count >= 0)` (all problems, also those beyond the 500 listed) |
| `summary` | jsonb | NOT NULL, default `'{}'` — see below; never personal data |
| `staged_rows` | jsonb | NULL — validated rows while `draft`, only when `issue_count = 0` |
| `issues` | jsonb | NULL — listed problems while `draft` |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| `resolved_at` | timestamptz | NULL (applied, discarded, or expired) |

Constraints: `UNIQUE (tenant_id, id)`; partial unique index `roster_imports_one_draft ON (tenant_id) WHERE
status = 'draft'`; `CHECK (status = 'draft' OR (staged_rows IS NULL AND issues IS NULL))` — personal data
can only exist on a draft; `CHECK (staged_rows IS NULL OR issue_count = 0)` — rows are kept only for an
applicable import; `CHECK (status = 'draft' OR resolved_at IS NOT NULL)`. Index
`roster_imports_tenant_created_idx (tenant_id, created_at DESC)`.

JSON shapes (TypeScript types in `packages/db/src/roster/types.ts`, validated with Zod when read back):

```ts
type StagedRow = [studentCode: string, fullName: string, level: number, divisionId: string];
type ImportIssue = { row: number; column: 'student_code' | 'name' | 'level' | 'division' | null;
                     code: RosterIssueCode; value?: string /* ≤ 40 chars */; otherRow?: number };
type ImportSummary = {
  ignoredColumns: string[];                       // header names only, ≤ 20, each ≤ 64 chars
  preview?: { added: number; changed: number; unchanged: number; removed: number; verifiedLosing: number };
  result?:  { added: number; changed: number; unchanged: number; removed: number;
              linked: number; unlinked: number; synced: number };
};
```

Derived: an import is **expired** when `status = 'draft' AND created_at <= now() - interval '24 hours'`.
`roster.purgeExpiredDrafts(tx)` turns such rows into `status = 'expired'`, clears `staged_rows` and `issues`,
sets `resolved_at`; it runs at the start of every roster action and of the roster screens (research.md §6).

State transitions:

```text
draft ──apply (no issues, not expired; atomic)──► applied    (terminal)
draft ──discard, or a new upload in the same college──► discarded (terminal)
draft ──24 h, at the next purge──► expired (terminal)
```

### 3.7 `roster_entries` — the official student list (and the verification link)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | NOT NULL, default `app_tenant_id()`, FK → `tenants(id)` |
| `student_code` | text | NOT NULL, `CHECK (student_code ~ '^[A-Za-z0-9-]{3,20}$')` (same rule as profiles) |
| `full_name` | text | NOT NULL, `CHECK (char_length(full_name) BETWEEN 2 AND 100)` |
| `level` | smallint | NOT NULL, `CHECK (level BETWEEN 1 AND 7)` |
| `division_id` | uuid | NOT NULL |
| `import_id` | uuid | NOT NULL — the last applied import that inserted or changed the entry |
| `user_id` | text | NULL — the verified student's account |
| `verification_method` | text | NULL, `CHECK (verification_method IN ('auto','manual'))` |
| `verified_by` | text | NULL, FK → `users(id)` ON DELETE SET NULL (who confirmed by hand) |
| `verified_at` | timestamptz | NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

Constraints:

- `UNIQUE (tenant_id, student_code)` (`roster_entries_tenant_code_unique`); `UNIQUE (user_id)`
  (`roster_entries_user_unique`; several NULLs allowed).
- FK `(tenant_id, division_id)` → `divisions (tenant_id, id)` RESTRICT; FK `(tenant_id, import_id)` →
  `roster_imports (tenant_id, id)` RESTRICT.
- **Verification link**: `FOREIGN KEY (user_id, student_code) REFERENCES student_profiles (user_id,
  student_code) ON UPDATE RESTRICT ON DELETE SET NULL (user_id)` (PostgreSQL ≥ 15 column list). A link can
  only point at a profile with the same code; a linked profile's code cannot change; deleting the account
  (feature 009) unlinks the entry.
- `CHECK (user_id IS NULL OR (verification_method IS NOT NULL AND verified_at IS NOT NULL))`. Repository
  writes always clear the three verification columns together; after an account deletion the stale method
  and time are ignored because `user_id` is NULL.
- Index `roster_entries_group_idx (tenant_id, level, division_id)`.

Derived verification status (never stored) — for a student code present on either side:

| Official entry | Profile with that code | Entry linked | Status |
|---|---|---|---|
| yes | yes | yes | `verified` (`auto` or `manual`) |
| yes | yes | no | `name_mismatch` |
| no | yes | — | `not_in_roster` |
| yes | no | — | `not_registered` |

Rules (repository; all take the roster lock of §2):

- **Lock**: `studentProfiles.update` (001) refuses a patch touching `studentCode`, `level`, or `divisionId`
  of a linked profile with reason `verified_locked` (checked by a `SELECT … FROM roster_entries WHERE user_id
  = $1 FOR SHARE` in the same transaction); the database FK independently refuses a code change.
- **Sync**: linking a profile, and applying an import that changes a linked entry's level or division, set
  `student_profiles.level` and `division_id` to the entry's values in the same transaction (internal
  function, not exported).
- **Automatic match** (`verifyProfile`, at profile creation, admin creation/correction of an unverified
  profile, and an unverified student's name change): lock the entry with the profile's code `FOR UPDATE`;
  if it exists, is unlinked, and `namesMatch(accountName, full_name)` → link `auto`, sync.
- **Apply** (`applyImport`): plan with `planRosterApply` (pure, `packages/db/src/roster/plan.ts`) from the
  staged rows, the current entries, and the college's profiles with account names; then delete entries
  whose code is absent; upsert staged rows (chunks of 1,000, `ON CONFLICT (tenant_id, student_code) DO UPDATE
  … WHERE` a value differs); unlink `auto` links whose name no longer matches; keep `manual` links whose code
  is still listed; link unlinked entries whose profile name matches (`auto`); sync linked profiles; mark the
  import applied with the result counts. All in one transaction; statement count independent of row count.
- **Manual confirmation**: entry and profile with the same code, unlinked → link `manual`,
  `verified_by = actor`, sync. **Undo**: only a `manual` link → clear the three columns (the profile keeps
  its synced values and becomes editable again).

## 4. Relationships

```text
tenants 1 ──< academic_terms, courses, course_topics, course_placements, course_teachers,
              roster_imports, roster_entries
courses 1 ──< course_topics            (composite FK keeps both in one college)
courses 1 ──< course_placements >── 1 divisions
courses 1 ──< course_teachers  >── 1 academic_terms ; course_teachers >── 1 users (role faculty, checked)
roster_imports 1 ──< roster_entries (import_id = last import that wrote the entry)
roster_entries 0..1 ── 0..1 student_profiles  (link on (user_id, student_code); verified students)
roster_entries >── 1 divisions
```

Derived (no table): a term's running courses = active courses with a placement whose `term_kind` = the
term's `kind`; a student's courses = those whose placement matches the student's `(level, division_id)`;
a course's students in a term = profiles whose `(level, division_id)` has a placement of the course with the
term's kind.

## 5. Audit catalogue additions (web `server/audit.ts`)

New target types: `term`, `course`, `roster_import`. Metadata: IDs, enumerations, and counts only.

| Action | Actor | Target | Metadata |
|---|---|---|---|
| `term.created` | catalog manager | term | `{}` |
| `term.updated` | catalog manager | term | `{ fields: string[] }` |
| `term.made_current` | catalog manager | term | `{ previousTermId? }` |
| `course.created` | catalog manager | course | `{}` |
| `course.updated` | catalog manager | course | `{ fields: string[] }` |
| `course.activated` / `course.deactivated` | catalog manager | course | `{}` |
| `course.topic_added` / `course.topic_renamed` / `course.topic_removed` | catalog manager | course | `{ topicId }` |
| `course.topic_moved` | catalog manager | course | `{ topicId, direction }` |
| `course.placement_added` / `course.placement_removed` | catalog manager | course | `{ level, termKind, divisionId }` (one event per placement) |
| `course.teacher_assigned` / `course.teacher_removed` | catalog manager | course | `{ termId, userId }` |
| `roster.import_uploaded` | catalog manager | roster_import | `{ rows, issues }` |
| `roster.import_discarded` | catalog manager | roster_import | `{}` |
| `roster.import_applied` | catalog manager | roster_import | `{ added, changed, removed, linked, unlinked, synced }` |
| `profile.verified` | the student (auto at profile completion or name change), admin (auto after a correction), or catalog manager (manual) | student_profile | `{ method }` |
| `profile.verification_undone` | catalog manager | student_profile | `{}` |

Expiry of a draft writes no audit row (no actor). Verification changes caused by an import are counted in
`roster.import_applied`, not written per student.

## 6. Seed additions (demo college, `pnpm db:seed`, idempotent)

A current term `2026/2027 first` (2026-09-19 → 2027-01-15) and a `second` term (2027-02-06 → 2027-06-10);
six demo courses with Arabic/English names, credit hours, a short Arabic description and 3–5 topics, placed
for level 1 `GEN` (first and second term) and level 2 `CS`/`IS` (first term). No teachers (the demo has no
faculty account) and no official list (it is loaded through the screen, quickstart V4). No real data.

## 7. Requirement traceability

| Entity / rule | Requirements |
|---|---|
| `academic_terms`, current-term rule | FR-001–FR-003, FR-011, FR-013 |
| `courses`, code normalisation | FR-004, FR-005, FR-007 |
| `course_topics`, ordering | FR-006 |
| `course_placements` | FR-008, FR-009, FR-011 |
| `course_teachers` | FR-010, FR-011, FR-012 |
| `roster_imports`, lifecycle, purge | FR-014–FR-021 |
| `roster_entries`, link, derived statuses, lock, sync | FR-018, FR-022–FR-028 |
| `student_profiles_user_code_unique` | FR-024 |
| RLS + classification of every table | FR-035 |
| Audit catalogue | FR-032 |
