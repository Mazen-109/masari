# Contract: `@masari/db` Additions

**Feature**: `002-academic-catalog` · Package `packages/db` · Extends
`specs/001-platform-foundation/contracts/db-api.md` (all its general rules apply: repository functions take
`tx` from `withTenant` for tenant-scoped tables; conflicts are typed results; no driver error with
parameters ever escapes; every function has an integration test run as the runtime role).

Module-facing reads (`catalog.*`, `roster.verificationOf`, `roster.listedStudents`) are specified in
[catalog-read.md](./catalog-read.md) and not repeated here.

## 1. Pure helpers (no I/O) — exported from `@masari/db`

### 1.1 `src/text.ts`

```ts
/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → 0–9; nothing else changes. */
export function toWesternDigits(s: string): string;
/** research.md §7: tashkeel and tatweel removed, alef/ta-marbuta/alef-maqsura/hamza-seat forms unified,
 *  digits Western, Latin lower-cased, punctuation and `_` → space, whitespace collapsed, trimmed. */
export function normalizeArabicText(s: string): string;
```

### 1.2 `src/roster/names.ts`

```ts
/** normalizeArabicText, split on spaces, `عبد` joined with the next word. */
export function nameTokens(name: string): string[];
/** k = min(|A|, |O|, 3); true iff k ≥ 2 and the first k tokens are equal (research.md §7). */
export function namesMatch(accountName: string, officialName: string): boolean;
```

### 1.3 `src/roster/plan.ts` and `src/roster/types.ts`

```ts
export type StagedRow = [studentCode: string, fullName: string, level: number, divisionId: string];
export type CurrentEntry = { id: string; studentCode: string; fullName: string; level: number;
  divisionId: string; userId: string | null; method: 'auto' | 'manual' | null };
export type ProfileForMatch = { userId: string; studentCode: string; accountName: string };
export type RosterPlan = {
  insert: StagedRow[]; update: Array<{ id: string; row: StagedRow }>; unchanged: number;
  remove: string[];                                  // entry ids
  link: Array<{ studentCode: string; userId: string }>;   // new automatic links
  unlink: string[];                                  // student codes whose automatic link no longer holds
  counts: { added: number; changed: number; unchanged: number; removed: number;
            verifiedLosing: number; linked: number; unlinked: number };
};
/** Pure: what applying `rows` to `current` does, given the college's profiles with account names.
 *  Removed entries lose any link; `manual` links survive while the code stays listed; `auto` links survive
 *  only while namesMatch(account, new official name); unlinked entries with a matching profile get `auto`.
 *  verifiedLosing = currently linked entries that are removed or unlinked. */
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

All writes take the roster lock (data-model.md §2) and start with `purgeExpiredDrafts`.

```ts
createDraft(tx: Tx, tenantId: string, input: { rowCount: number; rows: StagedRow[]; issues: ImportIssue[];
  issueCount: number; ignoredColumns: string[]; uploadedBy: string }): Promise<{ id: string; replacedDraftId: string | null }>
  // rowCount = data records in the file (valid or not); rows = the valid ones; issues = the first 500;
  // discards the college's existing draft (status discarded, resolved_by = uploadedBy, data cleared);
  // when issueCount = 0: stores rows in staged_rows and summary.preview (planRosterApply); otherwise stores
  // neither (an import with problems can never be applied, so its rows are not kept — data minimisation)
findImport(tx: Tx, id: string): Promise<RosterImportView | null>
  // { id, status, displayStatus ('expired' derived), rowCount, issueCount, issues (≤ 500, [] once resolved),
  //   summary, uploadedBy, resolvedBy, createdAt, resolvedAt } — never staged_rows
listImports(tx: Tx, opts: { limit: number }): Promise<RosterImportView[]>   // newest first; limit 1–50; issues omitted
currentDraftId(tx: Tx): Promise<string | null>                              // the college's unexpired draft
discard(tx: Tx, id: string, actorId: string): Promise<'discarded' | 'not_found' | 'not_draft'>
purgeExpiredDrafts(tx: Tx): Promise<number>                                 // data-model.md §3.6
applyImport(tx: Tx, tenantId: string, id: string, actorId: string):
  Promise<{ ok: true; result: ImportSummary['result'] } |
          { ok: false; reason: 'not_found' | 'not_draft' | 'expired' | 'has_issues' }>
  // data-model.md §3.7 "Apply"; locks the import row FOR UPDATE; one transaction (the caller's);
  // number of statements independent of the row count
verifyProfile(tx: Tx, tenantId: string, userId: string, accountName: string):
  Promise<'verified' | 'already_verified' | 'name_mismatch' | 'not_in_roster' | 'no_profile'>
  // automatic match of one profile (data-model.md §3.7); syncs level/division when it links
confirmMatch(tx: Tx, userId: string, actorId: string): Promise<'confirmed' | 'not_found' | 'not_mismatch'>
undoConfirmation(tx: Tx, userId: string): Promise<'undone' | 'not_found' | 'not_manual'>
overview(tx: Tx, filter: { q?: string; status?: VerificationStatus; page: number; pageSize: number }):
  Promise<{ rows: OverviewRow[]; total: number }>
  // FULL JOIN of roster_entries and student_profiles on (tenant_id, student_code); q matches student code or
  // official name (ILIKE, escaped); ordered by student_code; two statements; RangeError like courses.list
  // OverviewRow = { studentCode; status; method: 'auto' | 'manual' | null;
  //   official: { fullName; level; divisionId } | null; profile: { userId; level; divisionId } | null }
```

Any other database error is thrown as `RosterQueryError` (SQLSTATE only, no parameters, no `cause`): the
parameters contain student codes and names.

### 2.7 Changes to 001 repositories

**`studentProfiles.update`** — new failure reason `verified_locked` when the patch contains `studentCode`,
`level`, or `divisionId` and the profile is linked to an official-list entry (checked in the same
transaction, `FOR SHARE`). The empty-patch and other behaviours are unchanged. A foreign-key error caused by
a concurrent link (SQLSTATE `23503` on `roster_entries_profile_fk`) is also reported as `verified_locked`.

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
seedRoster(migrationUrl, tenantSlug, rows: Array<{ studentCode: string; fullName: string; level: number;
  divisionCode: string }>): Promise<void>                         // applied import + entries, no links
getRosterState(migrationUrl, tenantSlug): Promise<Array<{ studentCode: string; fullName: string; level: number;
  divisionCode: string; linkedEmail: string | null; method: 'auto' | 'manual' | null }>>   // by code
listRosterImports(migrationUrl, tenantSlug): Promise<Array<{ id: string; status: string; rowCount: number;
  issueCount: number; hasStagedData: boolean; createdAt: Date }>>  // newest first
ageRosterDraft(migrationUrl, tenantSlug, hours: number): Promise<void>   // moves the draft's created_at back
```

## 4. Required integration tests (`packages/db/test/*.int.test.ts`)

| File | Proves |
|---|---|
| `rls-meta.int.test.ts` (extended) | The seven new tables are classified exactly as data-model.md §1 (privileges, forced RLS, `tenant_isolation`). |
| `terms.int.test.ts` | Create/update/list order; `term_exists` per college and the same term in two colleges; `ends_on > starts_on` enforced; `setCurrent`: one current, previous id returned, already-current no-op, two concurrent calls on different terms → exactly one current and no error; cross-college `findById`/`update`/`setCurrent` → null/`not_found`. |
| `courses.int.test.ts` | Create/update with `code_taken` (same college) and the same code in two colleges; list search (escaped `%`/`_`), filters, pagination, two statements; `setActive`; topics: add to 50 then `too_many`, rename, move up/down incl. edges, remove renumbers without gaps, two concurrent `addTopic` → distinct positions, every topic write bumps the course's `updated_at`; unexpected errors carry no parameters; cross-college invisibility by id. |
| `placements.int.test.ts` | `add` for several divisions, `existing` count for duplicates, inactive or other-college division → `invalid_division` and nothing inserted; `remove`; course touched; `catalog.maxLevelInUse` over placements and entries; cross-college. |
| `teaching.int.test.ts` | `assign` happy path and idempotence; `course_inactive`; `invalid_teacher` for a student, a suspended faculty member, and a faculty member of another college; `too_many` at 11; `remove`; cross-college. |
| `catalog-read.int.test.ts` | Every function of catalog-read.md §2 and §3 (the `courseStudents`, `groupSizes`, and `roster` cases are added in PR-13) incl. summer term, no current term, no profile, inactive course, keyset pagination of `courseStudents`, `knowledgeCourses` `updatedSince`, and a cross-college case per function. |
| `users.int.test.ts` (extended) | The four new functions filter by college (another college's ids are never returned or locked); `listNamesInTenant` > 200 ids → `RangeError`. |
| `roster-imports.int.test.ts` | `createDraft` replaces the previous draft (one draft per college, also under two concurrent uploads), preview counts, `findImport` never returns staged rows and derives `expired`; `discard`; `purgeExpiredDrafts` clears data and sets `expired`; the CHECKs forbid staged data on a non-draft and on an import with problems (direct inserts fail); cross-college. |
| `roster-apply.int.test.ts` | Replace semantics (insert/update/unchanged/remove); `has_issues`, `expired`, `not_draft`; two concurrent applies → one `ok`; automatic links, `manual` links kept, `auto` links dropped on name change, removed students unlinked; verified profiles synced (level, division); statement count for 10 and 2,000 rows is the same (query counter); result counts equal the plan; cross-college. |
| `roster-verification.int.test.ts` | `verifyProfile` outcomes and sync; `confirmMatch` / `undoConfirmation` state rules; changing a linked profile's code at the SQL level fails on the FK; `overview` statuses, filters, search, pagination; cross-college. |
| `student-profiles.int.test.ts` (extended) | `update` → `verified_locked` for a patch touching code, level, or division of a linked profile (also when the link appears concurrently: `23503` mapped); other patches of a linked profile and every patch of an unlinked one behave as in 001. |
| `admin.int.test.ts` (extended) | Seed additions idempotent (data-model.md §6); test-support functions refuse a non-test database. |
