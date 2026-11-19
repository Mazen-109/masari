# Contract: `@masari/db` Additions

**Feature**: `002-academic-catalog` · Package `packages/db` · Extends
`specs/001-platform-foundation/contracts/db-api.md` (all its general rules apply: repository functions take
`tx` from `withTenant` for tenant-scoped tables; conflicts are typed results; no driver error with
parameters ever escapes; every function has an integration test run as the runtime role).

Module-facing reads (`catalog.*` of catalog-read.md §2, `roster.verificationOf`) are specified in
[catalog-read.md](./catalog-read.md) and not repeated here.

## 1. Pure helpers (no I/O) — exported from `@masari/db`

### 1.1 `src/text.ts`

```ts
/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → 0–9; nothing else changes. */
export function toWesternDigits(s: string): string;
/** Removes U+00AD, U+061C, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF
 *  (research.md §1); nothing else changes. */
export function stripInvisible(s: string): string;
/** research.md §7: stripInvisible, NFKC, tashkeel and tatweel removed, alef/ta-marbuta/alef-maqsura/
 *  hamza-seat forms unified, digits Western, Latin lower-cased, punctuation and `_` → space, whitespace
 *  collapsed, trimmed. */
export function normalizeArabicText(s: string): string;
```

### 1.2 `src/roster/names.ts`

```ts
/** normalizeArabicText, split on spaces, `عبد` joined with the next word. */
export function nameTokens(name: string): string[];
/** A = nameTokens(account), O = nameTokens(official), k = min(|O|, 3); true iff k ≥ 2, |A| ≥ k, and the
 *  first k tokens of A and O are equal (research.md §7). */
export function namesMatch(accountName: string, officialName: string): boolean;
```

### 1.3 `src/roster/plan.ts` and `src/roster/types.ts`

```ts
export type StagedRow = [studentCode: string, fullName: string, level: number, divisionId: string];
export type CurrentEntry = { id: string; studentCode: string; fullName: string; level: number;
  divisionId: string; userId: string | null; method: 'auto' | 'manual' | null; revokedUserId: string | null };
export type ProfileForMatch = { userId: string; studentCode: string; accountName: string };
export type RosterPlan = {
  insert: StagedRow[]; update: Array<{ id: string; row: StagedRow }>; unchanged: number;
  remove: string[];                                  // entry ids
  link: Array<{ studentCode: string; userId: string }>;   // new automatic links
  unlink: string[];                                  // student codes whose automatic link no longer holds
  counts: { added: number; changed: number; unchanged: number; removed: number;
            verifiedLosing: number; linked: number; unlinked: number };
};
/** Pure: what applying `rows` to `current` does, given the college's profiles with account names
 *  (data-model.md §3.7 "Automatic links across imports"). Removed entries lose any link; `manual` links
 *  survive while the code stays listed; an `auto` link survives unless the official name changes
 *  (normalizeArabicText differs), and then only if namesMatch(account, new official name) — a changed
 *  account name alone never unlinks; unlinked entries with a matching profile get `auto`, except when the
 *  profile's user is the entry's revokedUserId. verifiedLosing = currently linked entries that are removed
 *  or unlinked. The arrays are written by one statement each (unnest), so their sizes never change the
 *  statement count. */
export function planRosterApply(rows: readonly StagedRow[], current: readonly CurrentEntry[],
  profiles: readonly ProfileForMatch[]): RosterPlan;
export type RosterIssueCode = /* contracts/roster-csv.md §5 */;
export type ImportIssue = { row: number; column: 'student_code' | 'name' | 'level' | 'division' | null;
  code: RosterIssueCode; value?: string; otherRow?: number };
export type ImportSummary = /* data-model.md §3.6 */;
```

## 2. Repositories — `src/repositories/*.ts`, exported as namespaces

### 2.1 `terms`

```ts
list(tx: Tx): Promise<Term[]>                                   // ordering of data-model.md §3.1; at most 200
findById(tx: Tx, id: string): Promise<Term | null>              // malformed id → null
create(tx: Tx, input: { startYear: number; kind: TermKind; startsOn: string; endsOn: string }):
  Promise<{ ok: true; value: Term } | { ok: false; reason: 'term_exists' }>
update(tx: Tx, id: string, patch: Partial<{ startYear: number; kind: TermKind; startsOn: string; endsOn: string }>):
  Promise<{ ok: true; value: Term; fields: string[] } | { ok: false; reason: 'not_found' | 'term_exists' }>
  // fields = names of the columns whose value changed; empty patch / no change → fields [] and no write
setCurrent(tx: Tx, id: string):
  Promise<{ ok: true; previousId: string | null; changed: boolean } | { ok: false; reason: 'not_found' }>
  // locking order of data-model.md §2; already current → changed false, no write
```

### 2.2 `courses` (courses and topics)

```ts
list(tx: Tx, filter: { q?: string; level?: number; divisionId?: string; status?: 'active' | 'inactive';
                       page: number; pageSize: number }):
  Promise<{ rows: Array<CourseSummary & { placementCount: number }>; total: number }>
  // q: ILIKE on code, name_ar, name_en with %, _ and \ escaped; level/divisionId: EXISTS a placement with them;
  // order code, id; two statements; RangeError for page < 1 or pageSize outside 1–100
findById(tx: Tx, id: string): Promise<CourseDetail | null>       // = catalog.findCourse
create(tx: Tx, input: { code: string; nameAr: string; nameEn: string; creditHours: number; description: string }):
  Promise<{ ok: true; value: CourseSummary } | { ok: false; reason: 'code_taken' }>
update(tx: Tx, id: string, patch: Partial<{ code: string; nameAr: string; nameEn: string; creditHours: number; description: string }>):
  Promise<{ ok: true; value: CourseSummary; fields: string[] } | { ok: false; reason: 'not_found' | 'code_taken' }>
setActive(tx: Tx, id: string, isActive: boolean): Promise<{ value: CourseSummary; changed: boolean } | null>
addTopic(tx: Tx, courseId: string, title: string):
  Promise<{ ok: true; value: CourseTopic } | { ok: false; reason: 'not_found' | 'too_many' }>
renameTopic(tx: Tx, courseId: string, topicId: string, title: string): Promise<CourseTopic | null>
moveTopic(tx: Tx, courseId: string, topicId: string, direction: 'up' | 'down'): Promise<'moved' | 'unchanged' | 'not_found'>
removeTopic(tx: Tx, courseId: string, topicId: string): Promise<boolean>
```

Any other database error is thrown as `CourseQueryError` (`code` = SQLSTATE, message names the operation,
no `cause`), like 001's `StudentProfileQueryError`. Topic writes follow data-model.md §3.3 and touch the
course (§2).

### 2.3 `placements`

```ts
listForCourse(tx: Tx, courseId: string): Promise<Placement[]>   // { id, level, divisionId, termKind }; by term kind, level, division order
add(tx: Tx, courseId: string, input: { level: number; termKind: 'first' | 'second'; divisionIds: string[] }):
  Promise<{ ok: true; added: Placement[]; existing: number } | { ok: false; reason: 'not_found' | 'invalid_division' }>
  // not_found: no such course; invalid_division: an id that is not an ACTIVE division of the college
  // (nothing is inserted then); one INSERT … ON CONFLICT DO NOTHING RETURNING; touches the course when added > 0
remove(tx: Tx, courseId: string, placementId: string): Promise<Placement | null>   // touches the course
```

The level is validated against `levels_count` by the caller (it reads the session's college), like 001's
profile rules.

### 2.4 `teaching`

```ts
listForCourse(tx: Tx, courseId: string, termId: string): Promise<Array<{ userId: string; assignedAt: Date }>>
assign(tx: Tx, tenantId: string, input: { termId: string; courseId: string; userId: string; assignedBy: string }):
  Promise<{ ok: true; created: boolean } |
          { ok: false; reason: 'not_found' | 'course_inactive' | 'invalid_teacher' | 'too_many' }>
  // data-model.md §3.5; not_found = unknown term or course of this college
remove(tx: Tx, input: { termId: string; courseId: string; userId: string }): Promise<boolean>
```

### 2.5 `catalog` (beyond catalog-read.md)

```ts
maxLevelInUse(tx: Tx): Promise<number>   // highest level over course_placements and roster_entries; 0 when none
```

### 2.6 `roster` (beyond catalog-read.md §3)

All writes take the roster lock (data-model.md §2) as their first statement. Purging expired drafts:
`createDraft` purges first; `applyImport` and `discard` judge their own target instead (an expired draft →
`expired`, data-model.md §3.6); the roster screens call `purgeExpiredDrafts` when rendered.

```ts
createDraft(tx: Tx, tenantId: string, input: { rowCount: number; rows: StagedRow[]; issues: ImportIssue[];
  issueCount: number; ignoredColumns: string[]; uploadedBy: string }): Promise<{ id: string; replacedDraftId: string | null }>
  // rowCount = data records in the file (valid or not); rows = the valid ones; issues = the first 500;
  // discards the college's existing draft (status discarded, resolved_by = uploadedBy, data cleared);
  // when issueCount = 0: stores rows in staged_rows and summary.preview (planRosterApply); otherwise stores
  // neither (an import with problems can never be applied, so its rows are not kept — data minimisation);
  // a fixed number of statements (the preview reads entries and profiles once)
findImport(tx: Tx, id: string): Promise<RosterImportView | null>
  // { id, status, displayStatus ('expired' derived), rowCount, issueCount, issues (≤ 500, [] once resolved),
  //   summary, uploadedBy, resolvedBy, createdAt, resolvedAt } — never staged_rows
listImports(tx: Tx, opts: { limit: number }): Promise<RosterImportView[]>   // newest first; limit 1–50; issues omitted
currentDraftId(tx: Tx): Promise<string | null>                              // the college's unexpired draft
discard(tx: Tx, id: string, actorId: string): Promise<'discarded' | 'not_found' | 'not_draft' | 'expired'>
purgeExpiredDrafts(tx: Tx): Promise<number>                                 // data-model.md §3.6
applyImport(tx: Tx, tenantId: string, id: string, actorId: string, opts: { confirmedRemoval?: number }):
  Promise<{ ok: true; result: ImportSummary['result'] } |
          { ok: false; reason: 'not_found' | 'not_draft' | 'expired' | 'has_issues' | 'levels_changed' } |
          { ok: false; reason: 'large_removal'; removed: number; current: number }>
  // data-model.md §3.7 "Apply" (order of checks, unnest writes); one transaction (the caller's);
  // a fixed number of statements for any row count
verifyProfile(tx: Tx, tenantId: string, userId: string, accountName: string):
  Promise<'verified' | 'already_verified' | 'name_mismatch' | 'not_in_roster' | 'no_profile'>
  // automatic match of one profile (data-model.md §3.7); never links the entry's revoked_user_id
  // (→ 'name_mismatch'); syncs level/division when it links
confirmMatch(tx: Tx, userId: string, actorId: string): Promise<'confirmed' | 'not_found' | 'not_mismatch'>
  // clears revoked_user_id
revokeVerification(tx: Tx, userId: string, actorId: string):
  Promise<{ ok: true; method: 'auto' | 'manual' } | { ok: false; reason: 'not_found' | 'not_verified' }>
  // any method; clears the link and sets revoked_user_id = userId (data-model.md §3.7)
overview(tx: Tx, filter: { q?: string; status?: VerificationStatus; page: number; pageSize: number }):
  Promise<{ rows: OverviewRow[]; total: number }>
  // FULL JOIN of roster_entries and student_profiles on (tenant_id, student_code); q matches the student
  // code (ILIKE, escaped) or, after normalizeArabicText, roster_entries.name_search (ILIKE, escaped);
  // ordered by student_code; two statements; RangeError like courses.list
  // OverviewRow = { studentCode; status; method: 'auto' | 'manual' | null; revoked: boolean;
  //   official: { fullName; level; divisionId } | null; profile: { userId; level; divisionId } | null }
```

`verificationOf` (catalog-read.md §3) is in the same file and namespace.

Any other database error is thrown as `RosterQueryError` (SQLSTATE only, no parameters, no `cause`): the
parameters contain student codes and names.

### 2.7 Changes to 001 repositories

**`studentProfiles.update`** — when the patch **changes** `studentCode`, `level`, or `divisionId` (a value
different from the stored one; the current row is read first), the function takes the college's roster
lock (data-model.md §2) and returns the new failure reason `verified_locked` if the profile is linked to an
official-list entry. A patch that only repeats stored values, and every other field, behave as in 001. The
foreign-key error of a code change on a linked profile (SQLSTATE `23503` on `roster_entries_profile_fk`) is
added to the function's `CONFLICTS` map as `verified_locked`, so it never surfaces as `internal`. Delivered
in PR-13, together with the tables, so the lock exists before the first link can be created (PR-18).

**`users`** (global table; every function takes `tenantId` and filters on it — 001 compensating control):

```ts
listNamesInTenant(tx: Tx, tenantId: string, userIds: readonly string[]): Promise<Array<{ id: string; name: string }>>
  // ids not in the college are left out; RangeError for more than 200 ids
listStudentNames(tx: Tx, tenantId: string): Promise<Array<{ id: string; name: string }>>   // role student
listActiveFaculty(tenantId: string): Promise<Array<{ id: string; name: string }>>
  // role faculty, status active, ordered by name, at most 1,000
lockMemberInTenant(tx: Tx, tenantId: string, userId: string): Promise<{ role: Role; status: UserStatus } | null>
  // FOR SHARE; null when the user is not in the college
```

## 3. `@masari/db/admin` test support additions (`src/admin/test-support.ts`)

Each refuses (before connecting) a database whose name does not match `/^masari_(test|e2e)[a-z0-9_]*$/` and
writes no audit row.

```ts
createTerm(migrationUrl, tenantId, input: { startYear: number; kind: TermKind; startsOn?: string; endsOn?: string;
  isCurrent?: boolean }): Promise<string>                          // id; default dates derived from the year
createCourse(migrationUrl, tenantId, input: { code: string; nameAr: string; nameEn: string; creditHours?: number;
  description?: string; topics?: string[]; isActive?: boolean }): Promise<string>
addPlacement(migrationUrl, tenantId, input: { courseId: string; level: number; divisionCode: string;
  termKind: 'first' | 'second' }): Promise<void>
assignTeacher(migrationUrl, tenantId, input: { termId: string; courseId: string; email: string }): Promise<void>
listRosterImports(migrationUrl, tenantSlug): Promise<Array<{ id: string; status: string; rowCount: number;
  issueCount: number; hasStagedData: boolean; createdAt: Date }>>  // newest first            (PR-14)
ageRosterDraft(migrationUrl, tenantSlug, hours: number): Promise<void>   // moves the draft's created_at back (PR-14)
getRosterState(migrationUrl, tenantSlug): Promise<Array<{ studentCode: string; fullName: string; level: number;
  divisionCode: string; linkedEmail: string | null; method: 'auto' | 'manual' | null }>>   // by code (PR-18)
seedRoster(migrationUrl, tenantSlug, rows: Array<{ studentCode: string; fullName: string; level: number;
  divisionCode: string }>): Promise<string>                       // applied import id + entries, no links (PR-19)
ensureScreenFixtures(migrationUrl, tenantId, input: { studentEmail: string }):
  Promise<{ courseId: string; importId: string | null }>
  // e2e screen lists only (contracts/routes.md §1). Idempotent and safe under concurrent workers: takes a
  // transaction-level advisory lock on the college, then creates only what is missing — a current first
  // term 2026 (if the college has no current term), course `A11Y 101` with two topics (PR-5); a placement of
  // it for the student's (level, division) in the first term (PR-11); an applied import with three
  // synthetic entries whose codes start with `ZZ-` and match no profile (PR-17, then `importId` is set).
```

PR numbers above say which batch adds each helper; `createTerm` and `createCourse` come with PR-2 and PR-4,
`addPlacement` and `assignTeacher` with PR-7.

## 4. Required integration tests (`packages/db/test/*.int.test.ts`)

| File | Proves |
|---|---|
Every file that introduces a table contains, for each of its tables, an explicit **isolation read** case and
**isolation write** case (data-model.md §1): inside college B's context, college A's rows are not returned,
an `INSERT` with A's `tenant_id` fails the policy, and `UPDATE`/`DELETE` aimed at A's rows affect 0 rows.

| File | Proves |
|---|---|
| `rls-meta.int.test.ts` (extended) | The seven new tables are classified exactly as data-model.md §1 (privileges, forced RLS, `tenant_isolation`). |
| `terms.int.test.ts` | Isolation read/write for `academic_terms`; create/update/list order; `term_exists` per college and the same term in two colleges; `ends_on > starts_on` enforced; `setCurrent`: one current, previous id returned, already-current no-op, two concurrent calls on different terms → exactly one current and no error; cross-college `findById`/`update`/`setCurrent` → null/`not_found`. |
| `courses.int.test.ts` | Isolation read/write for `courses` and `course_topics`; create/update with `code_taken` (same college) and the same code in two colleges; list search (escaped `%`/`_`), filters, pagination, two statements; `setActive`; topics: add to 50 then `too_many`, rename, move up/down incl. edges, remove renumbers without gaps, two concurrent `addTopic` → distinct positions, every topic write bumps the course's `updated_at`; unexpected errors carry no parameters; cross-college invisibility by id. |
| `placements.int.test.ts` | Isolation read/write for `course_placements`; `add` for several divisions, `existing` count for duplicates, inactive or other-college division → `invalid_division` and nothing inserted; `remove`; course touched; `catalog.maxLevelInUse` over placements (PR-7) and entries (PR-14); cross-college. |
| `teaching.int.test.ts` | Isolation read/write for `course_teachers`; `assign` happy path and idempotence; `course_inactive`; `invalid_teacher` for a student, a suspended faculty member, and a faculty member of another college; `too_many` at 11; `remove`; cross-college. |
| `catalog-read.int.test.ts` | Every function of catalog-read.md §2 (PR-10) and §3 (PR-21) incl. summer term, no current term, no profile, inactive course, a past term computed from the current profile, ordering, `termOfferings` in two statements, and a cross-college case per function. |
| `users.int.test.ts` (extended) | The four new functions filter by college (another college's ids are never returned or locked); `listNamesInTenant` > 200 ids → `RangeError`. |
| `roster-tables.int.test.ts` (PR-13) | Isolation read/write for `roster_imports` and `roster_entries`; the CHECKs forbid staged data on a non-draft and on an import with problems (direct inserts fail); `roster_entries_profile_fk`: a link to a profile of **another college with the same code** fails (inserted as the owner role, bypassing RLS), a link to a profile with a different code fails, changing a linked profile's code fails, deleting the profile's account sets only `user_id` to NULL. |
| `student-profiles.int.test.ts` (extended, PR-13) | `update` → `verified_locked` for a patch that changes code, level, or division of a linked profile (link created by owner SQL), and for the `23503` path; a patch repeating the stored values of a linked profile succeeds; other fields and unlinked profiles behave as in 001; a level change waits for a concurrent holder of the roster lock (two connections). |
| `roster-imports.int.test.ts` (PR-14) | `createDraft` replaces the previous draft (one draft per college, also under two concurrent uploads), preview counts, `findImport` never returns staged rows and derives `expired`; `discard` incl. `expired`; `purgeExpiredDrafts` clears data and sets `expired`; cross-college. |
| `roster-apply.int.test.ts` (PR-18) | Replace semantics (insert/update/unchanged/remove); reasons in the order of data-model.md §3.7 — an expired draft answers `expired` (both before and after a purge), `has_issues`, `not_draft`, `levels_changed` after `levels_count` is reduced, `large_removal` (21% removed without confirmation; accepted with `confirmedRemoval` equal to the count, refused with another number); two concurrent applies → one `ok`; `manual` links kept; `auto` links kept when only the account name changed and re-checked when the official name changed; `revoked_user_id` never re-linked; removed students unlinked; verified profiles synced (level, division); **the same statement count for 10 and 2,000 rows** (query counter); result counts equal the plan; cross-college. |
| `roster-verification.int.test.ts` (PR-19, PR-20) | `confirmMatch` (clears `revoked_user_id`) / `revokeVerification` of `auto` and `manual` links; `overview` statuses incl. `revoked`, filters, search by code and by name with spelling variants («احمد» finds «أحمد»), pagination (PR-19); `verifyProfile` outcomes, sync, and refusal for a revoked account (PR-20); cross-college. |
| `admin.int.test.ts` (extended, PR-22) | Seed additions idempotent (data-model.md §6). |
| `test-support.int.test.ts` (extended in each batch that adds a helper) | Every new test-support function refuses a database whose name is not a test database; `ensureScreenFixtures` is idempotent (two concurrent calls create one of each fixture). |
