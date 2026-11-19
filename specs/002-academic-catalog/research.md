# Research & Technical Decisions: Academic Catalog & Student Roster

**Feature**: `002-academic-catalog` · **Date**: 2026-11-19 · **Phase**: 0 (speckit-plan)

Every unknown in the plan's Technical Context is resolved here. Format per item: **Decision** ·
**Rationale** · **Alternatives considered**. The two decisions the roadmap leaves to this plan are §1 (CSV
format and Arabic encoding) and §2 (whether verified students may edit level and division). There are no
open `NEEDS CLARIFICATION` items.

> **Verification caveat** (same rule as feature 001, research.md there): library option names below come
> from the architect's knowledge. Observable behaviour (contracts, data model, Accept lines) is binding; if
> the pinned version names an option differently, implement the same behaviour with the documented
> equivalent and record a Spec deviation. No new runtime dependency is introduced by this feature.

## 1. CSV format and Arabic encoding (roadmap: "decide in its plan")

- **Decision**: the official list is a CSV file (`.csv`) with a header row and exactly four recognised
  columns — student code, full name, level, division — identified by Arabic or English header names in any
  order (aliases and value rules in `contracts/roster-csv.md`). The server reads the bytes and decides the
  encoding in this order:
  1. starts with `EF BB BF` → **UTF-8 with BOM** (Excel "CSV UTF-8 (Comma delimited)"); the BOM is dropped;
  2. starts with `FF FE` or `FE FF` → UTF-16 (Excel "Unicode Text") → refused, `file_encoding`, with the hint
     to save as "CSV UTF-8";
  3. starts with `50 4B 03 04` (ZIP: `.xlsx`/`.ods`) or `D0 CF 11 E0` (legacy `.xls`), or contains a `00`
     byte → refused, `file_type`, with the hint "this is a workbook, save it as CSV";
  4. decodes without error as strict UTF-8 (`new TextDecoder('utf-8', { fatal: true })`) → **UTF-8 without
     BOM** (exports of student information systems, Google Sheets, LibreOffice);
  5. otherwise → **Windows-1256** (`new TextDecoder('windows-1256')`), the Arabic Windows "ANSI" code page
     that Excel uses for "CSV (Comma delimited)" on an Arabic-locale Windows.

  The separator is detected from the header row: the first of comma, semicolon, tab that splits it into
  fields containing at least two recognised headers (Excel uses the regional list separator, which is `;` on
  some machines). Fields follow RFC 4180 quoting (quotes, doubled quotes, separators and line breaks inside
  quotes); line endings CRLF, LF, or CR; blank records skipped; a trailing newline optional.
  Values are normalised: invisible formatting characters removed from every cell (`stripInvisible`: U+00AD,
  U+061C, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF — Excel and Arabic office
  programs insert LRM/RLM and zero-width characters around codes and names), Unicode NFKC applied (turns
  Arabic presentation forms from PDF copies, and full-width Latin letters and digits, into ordinary
  characters), trimmed, Arabic-Indic (`٠–٩`) and Extended Arabic-Indic (`۰–۹`) digits converted to `0–9`,
  inner whitespace collapsed in names. **Student codes keep their letter case** and are compared exactly,
  like feature 001's profiles (`^[A-Za-z0-9-]{3,20}$`, case-sensitive unique constraint): matching an entry
  to a profile is plain equality, which the verification foreign key requires (§8). A case-insensitive rule
  would need a change to 001's codes and data; it is listed for the owner (spec Clarifications).
  Limits: 2 MB, 10,000 data records, 500 listed problems.
  A UTF-8-with-BOM template with Arabic headers is offered for download.
- **Rationale**: the college's data will come from Excel on Egyptian office PCs. Excel offers two CSV
  flavours and writes Arabic in UTF-8 only for "CSV UTF-8"; plain "CSV" is written in the system code page,
  which on Arabic Windows is Windows-1256 — a file in that encoding read as UTF-8 shows mojibake or fails, so
  supporting it removes the most common support request. The order of checks is unambiguous: UTF-8 has a
  strict byte grammar, and Windows-1256 Arabic text (bytes `C1–FF` in runs) practically never forms valid
  multi-byte UTF-8 sequences, while pure ASCII files decode identically either way. `TextDecoder` with
  `windows-1256` is part of the WHATWG Encoding standard and is available in official Node.js builds (full
  ICU, the default since Node 13; Vercel and the CI image use official builds); a unit test decoding known
  Windows-1256 bytes guards against a small-ICU runtime. Refusing UTF-16 and workbooks with a specific hint is
  cheaper than supporting them and tells the user exactly which Excel option to choose.
- **Alternatives considered**: accepting `.xlsx` directly — needs a spreadsheet parser dependency (large,
  security-sensitive zip/XML parsing) for a once-a-term upload; rejected. Heuristic encoding detection
  libraries (`chardet`, `jschardet`) — a dependency for a two-candidate decision. Asking users to choose the
  encoding in a select — users do not know it; the wrong choice silently corrupts names. Accepting only
  UTF-8 — fails for every file saved with Excel's default "CSV" on Arabic Windows.

## 2. May verified students still edit level and division? (roadmap: "decide in its plan")

- **Decision**: **No.** Once a student is verified against the official list:
  - the student cannot change level or division (the student code was already not editable, 001 FR-025);
  - the administration's correction screen (001 FR-028) refuses changes to the student code, level, or
    division of a verified student;
  - level and division change only through an applied import: when the official list changes them, the
    verified profile follows in the same transaction.

  The lock is enforced in `@masari/db` (`studentProfiles.update` takes the college's roster lock when the
  patch changes code, level, or division, and returns `verified_locked` for a profile linked to an
  official-list entry) and, for the student code, also by the database (the link is a foreign key on
  `(tenant_id, user_id, student_code)` with `ON UPDATE RESTRICT`, data-model.md §3.7). The UI shows locked
  fields read-only with the reason. A student who leaves the list (or whose automatic match no longer holds)
  is unlocked automatically.

  **Escape hatch for wrong verifications**: a catalog manager can **revoke** any verification, automatic or
  manual (FR-026). Revocation unlinks the entry, unlocks the profile, and records the account on the entry
  (`revoked_user_id`) so that automatic matching never re-links that account to that code — only a manual
  confirmation can. This is the path for an impostor who was verified automatically with someone else's
  code: revoke, then the administration corrects the impostor's student code (001's People dialog), and the
  real owner registers. The lock itself stays absolute: revocation is an explicit, audited state change,
  not an override of individual fields.
- **Rationale**:
  - The roadmap's purpose for the roster is "locking verified academic data"; a lock the student can lift by
    editing would make verification meaningless for the consumers that need trustworthy data — Kitabi's
    watermarks and per-level book eligibility (constitution VIII) and CodeJudge's course membership.
  - Constitution IX: one shared profile, no drifting copies. If verified profiles could be edited, the
    profile and the official list would disagree and every module would have to decide which one to trust.
    With the lock, for a verified student the two are equal by construction.
  - Legitimate changes are already covered: promotion to the next level and transfers between divisions are
    official decisions that appear in the next official list, which re-syncs every verified profile at once.
  - Allowing the administration to override would reintroduce the drift; the right place to fix an official
    error is the official list (the college's own source system), then a re-import. Imports take seconds and
    show a preview, so a one-student fix is a small, auditable operation.
- **Alternatives considered**: (a) students may edit, and editing removes the verification — verification
  becomes optional and silently disappears; (b) lock only the division (levels change yearly) — the yearly
  import already moves levels; (c) administration may override with an audit entry — two sources of truth
  for the same student and an extra "override wins until next import" rule nobody can predict; (d) a
  per-student "edit official entry" screen — useful later (feature 023 or 009), not needed for the MVP.

## 3. Import inside the request (bounded) instead of a background job

- **Decision**: upload/validation and apply run inside their Server Actions, bounded by hard limits (2 MB,
  10,000 rows) and implemented with a **fixed number of SQL statements**: every set (removed, new, changed,
  links to clear, links to set) is written by one statement whose rows arrive as array parameters expanded
  with `unnest()` (data-model.md §3.7 "Apply"). This is an **exception to constitution VI** ("bulk imports
  MUST run outside the request/response cycle"), recorded in plan.md Complexity Tracking. It needs the
  owner's acceptance **before this documentation is merged**, because rejecting it would redesign the
  upload and apply batches. When feature 003 introduces the PostgreSQL-backed job runner, moving apply to a
  job is a contained change behind the same action (only the action body changes).
- **Rationale**: the job runner is planned to arrive with its first consumer in 003 (roadmap R5); adding it
  in 002 only for an operation that runs a few times per term would pull 003's infrastructure decisions
  (queue library, worker hosting on Vercel) forward. Estimated cost of the bounded work: parsing and
  validating 10,000 rows in memory is tens of milliseconds; applying is about 12 statements (lock, import
  row, levels, two reads for planning, delete, insert, update, unlink, link, profile sync, import result)
  plus the audit row, whatever the row count. A 10,000-element array parameter is about 0.5 MB on the wire,
  well within PostgreSQL's limits, and `unnest()` of several arrays of equal length yields aligned rows. The
  page is not blocked for other users — only the catalog manager waits, with a pending state on the button.
  Chunked statements (1,000 rows each) were considered first; they make the statement count grow with the
  row count, which contradicts the bound this exception relies on and the test that proves it.
- **Alternatives considered**: introducing the job runner now (violates R5's "with its first consumer",
  doubles 002's infrastructure); client-side chunked uploads (more JavaScript and partial-state handling);
  a lower cap (5,000) — would refuse the list of a large college outright.

## 4. CSV parser: written in-house

- **Decision**: a small RFC 4180 parser in `apps/web/src/lib/csv.ts` (`decodeCsvBytes`, `parseCsv`,
  `detectSeparator`), about 120 lines, pure and unit-tested with a table of tricky inputs (quotes, doubled
  quotes, separators and newlines inside quotes, CRLF/LF/CR, BOM, trailing separator, unterminated quote →
  error). No dependency.
- **Rationale**: constitution I/VII prefer the platform over a dependency; the needed subset is small and
  well specified; a parser in `src/lib` counts toward the 80% coverage gate. The roster rules live in
  `features/roster/rules.ts` and receive already-split records.
- **Alternatives considered**: `csv-parse` (MIT, robust, streaming — but streaming is unnecessary at 2 MB
  and it adds a dependency tree), `papaparse` (MIT, browser-oriented, larger). Either would be acceptable
  if the in-house parser proves fragile; the unit table is the guard.

## 5. Import lifecycle: draft → preview → apply (replace semantics)

- **Decision**: an upload validates the file and stores an **import** row (`roster_imports`) in status
  `draft` holding the problems (`issues` JSONB, ≤ 500) and, only when there are none, the validated rows
  (`staged_rows` JSONB, compact tuples) and the preview counts. At most one draft per college (partial unique index); a new upload
  discards the previous draft. Apply (only for a draft without problems, younger than 24 hours) replaces the
  official list in one transaction and records the actual counts. Discard clears the draft. The preview and
  the apply use the **same pure planning function** (`planRosterApply`, `@masari/db`), so the preview is
  exactly what apply would do against the data at that moment; apply recomputes it against the current data.
  Apply re-checks what can change during the draft's 24 hours: the college's number of levels (a reduction
  below a staged level → `levels_changed`, upload again; counting draft levels in the settings rule instead
  would let a forgotten draft block an administrator's setting) — divisions cannot be deleted, and inactive
  divisions are valid in the list. An apply that removes more than 20% of a non-empty list needs a second
  confirmation that repeats the number removed (`large_removal`), enforced on the server so it holds without
  JavaScript.
  Order of checks: the target import is locked and judged first (`not_found`, `not_draft`, `expired`,
  `has_issues`), so an expired draft always answers `expired`; the general purge of other expired drafts is
  not needed there because a college has at most one draft.
- **Rationale**: replace semantics match what the college has (a complete list), but a wrong file would
  remove everyone; the preview (including "verified students who will lose their verification") makes the
  consequence visible before it happens. Storing the validated rows avoids asking the user to upload twice.
  A single draft per college avoids "which draft is this" confusion and bounds stored data.
- **Alternatives considered**: upsert-only imports — removed students would stay "official" forever;
  applying valid rows of a file with errors — with replace semantics, invalid rows would be treated as
  removed students; a separate `roster_import_rows` table — more schema for data that lives at most 24 hours.

## 6. Personal data of roster files: where it is stored and for how long

- **Decision**:

  | Data | Where | Kept |
  |---|---|---|
  | Uploaded file bytes | request memory only — never written to disk, object storage, the database, or logs | for the duration of the request |
  | Columns other than the four | discarded while parsing; only their header names are kept (in the import's summary, to tell the user) | never stored |
  | Validated rows of an error-free draft (`staged_rows`; a draft with problems keeps no rows) and the problems of a draft (`issues`, ≤ 500, offending values truncated to 40 characters) | `roster_imports` row | until applied, discarded, or replaced; after 24 hours the draft cannot be applied and its data is cleared the next time the college's roster screen or a roster action runs |
  | Import summary (who, when, status, counts, ignored header names) | `roster_imports` row | as long as the college's data (audit trail; no personal data) |
  | Official-list entries (code, name, level, division, link) | `roster_entries` | while present in the current official list; deleted when an applied import no longer contains them |
  | Audit events | `audit_events` | append-only, counts and IDs only |

  Logs record event names, counts, and SQLSTATEs only — never file contents, codes, names, or problem
  values (contracts/server-actions.md §7).
- **Rationale**: constitution III (data minimisation; files never on local disk; logs without personal
  data) and Egypt's PDPL (purpose limitation). The architecture rule "uploaded files go to object storage"
  is satisfied by not storing the file at all — only the four needed values are kept, as structured data.
  A scheduled clean-up across colleges needs the job runner (003); until then the "next use" purge plus the
  24-hour apply limit bounds exposure to the catalog managers of that college, who uploaded the data
  themselves. Until then an expired draft of a college whose roster screen is not opened again keeps its
  data longer than 24 hours (unusable, but stored); the daily purge across colleges is therefore recorded as
  a tracked item of feature 003 in `docs/roadmap.md` (§2 "003"), not only here.
- **Alternatives considered**: keeping the original file for re-processing — personal data kept without
  need; storing problems without values — reports like "unknown division" would be much harder to act on.

## 7. Name matching and Arabic normalisation

- **Decision**: `normalizeArabicText(s)` and `toWesternDigits(s)` in `packages/db/src/text.ts` (pure,
  exported from `@masari/db`): remove tashkeel (`U+064B–U+065F`, `U+0670`) and tatweel (`U+0640`); map
  `أ إ آ ٱ` → `ا`, `ة` → `ه`, `ى` → `ي`, `ؤ` → `و`, `ئ` → `ي`; convert digits; lower-case Latin; replace
  punctuation and underscores with spaces; collapse whitespace; trim — after `stripInvisible` and NFKC (§1),
  which it applies first. `nameTokens(s)` additionally joins `عبد` with the following word
  (`عبد الله` = `عبدالله`). `namesMatch(account, official)`: with `A` and `O` the token lists,
  `k = min(|O|, 3)`; match iff `k ≥ 2`, `|A| ≥ k`, and the first `k` tokens of both are equal. The same
  normaliser is used for CSV header aliases, division names, level words, and the overview's name search.
- **Rationale**: Egyptian names have four parts (name, father, grandfather, family); registrations often
  give two or three. The account name is chosen by the user, so the threshold is taken from the **official**
  name: an account must carry the first three official names (both, for a two-word official name). With the
  earlier `k = min(|A|, |O|, 3)` an impostor who set a two-word account name only needed the owner's first
  and father's names — often known to classmates. Three names (including the grandfather's) is a higher bar
  while still matching the common spelling variants (hamza, ta marbuta, alef maqsura). Two further controls
  close the remaining gap: the automatic check after a **name change** is rate-limited (`profile-verify`,
  5 per student per 24 hours, contracts/server-actions.md §2) so names cannot be guessed in bulk, and a
  catalog manager can **revoke** a wrong verification and block its automatic return (§2). Students whose
  account name has only two words are not verified automatically; the unverified panel gives everyone the
  same neutral advice to write at least their first three names (FR-027), and the rest goes to a human
  (FR-026). The rule lives in `@masari/db` because the matching runs inside the repository transaction that
  applies an import (§5); the web app's roster rules import the pure helpers from `@masari/db` — a pure,
  I/O-free export, which plan.md lists as an allowed import for `rules.ts`.
- **Alternatives considered**: fuzzy similarity (Levenshtein/Jaro–Winkler) — harder to explain and to test,
  and accepts more impostors; exact full-name equality — most real registrations would fail; keeping
  `k = min(|A|, |O|, 3)` with only a rate limit — guessing two names is often not guessing at all.

## 8. Where verification is stored

- **Decision**: the link lives on the official-list entry: `roster_entries.user_id` (+ `verification_method`
  `auto|manual`, `verified_by`, `verified_at`, and `revoked_user_id` after a revocation). A composite
  foreign key `(tenant_id, user_id, student_code)` → `student_profiles (tenant_id, user_id, student_code)`
  guarantees the linked profile belongs to the same college and carries the same code (and makes the code
  of a linked profile impossible to change). The database checks foreign keys without row-level security,
  so `tenant_id` must be part of the key, as in every other composite reference of this feature; a key on
  `(user_id, student_code)` alone would let an entry of college A point at a profile of college B with the
  same code. Statuses are **derived**, never stored:
  verified = entry linked; name mismatch = entry and profile with the same code, not linked; not in list =
  profile without entry; not registered = entry without profile.
- **Rationale**: feature 001's data model says later features extend the shared profile with their own
  tables and do not add columns to `student_profiles`; the official entry is the natural owner of "who was
  matched to me". Derived statuses cannot go stale. Student codes are unique per college on both sides, so
  the match is one-to-one.
- **Alternatives considered**: a `verified` column on `student_profiles` — breaks 001's rule and duplicates
  the link; a separate `profile_verifications` table — a third table for a one-to-one fact.

## 9. Catalog model: placements in the study plan, teachers per term

- **Decision**: a course is placed once in the study plan (`course_placements`: level, division, term kind
  `first|second`); teachers are assigned per actual term (`course_teachers`: term, course, faculty user).
  The courses **running in a term** are derived: active courses with a placement whose term kind equals the
  term's kind (none for a summer term). The **current term** is an explicit flag set by a catalog manager
  (at most one per college), not inferred from dates.
- **Rationale**: Egyptian study plans (اللائحة) fix each course to a level, division, and semester; they do
  not change between years, so re-entering offerings every term would be pure data-entry cost. Teachers do
  change every term. An explicit current term is deterministic (tests need no clock) and keeps working
  between terms and during vacations. This supports every consumer: Kitabi (a student's courses), CodeJudge
  (teacher and students of a course in a term), the timetable (a term's courses with their groups and
  teachers).
- **Alternatives considered**: explicit per-term offerings (`course_offerings`) — flexible but doubles data
  entry; sections belong to 007. Current term by date range — breaks on gaps and overlaps and makes tests
  time-dependent.

## 10. Topic ordering

- **Decision**: topics are rows with stable IDs and a `position` (1…n), `UNIQUE (course_id, position)`
  **deferrable initially deferred** (so a move swaps two positions and a removal renumbers in one
  transaction). Adding locks the course row (`FOR UPDATE`) and appends at `max + 1`; the 50-topic cap is
  checked under the same lock.
- **Rationale**: Mizan (010) will map exam questions to topics; stable IDs survive renames and moves. The
  per-topic actions work without JavaScript (each is a small form).
- **Alternatives considered**: a `text[]` column or a textarea "one topic per line" — simplest UI, but every
  save would recreate topics and break later references.

## 11. Course codes

- **Decision**: normalised on input (`trim`, inner whitespace → one space, Latin upper-case, digits to
  Western) and validated against `^[\p{L}\p{N}](?:[\p{L}\p{N} .-]{0,18}[\p{L}\p{N}])?$` with length 2–20 after
  normalisation; `UNIQUE (tenant_id, code)` on the normalised value. Codes are editable (modules reference
  courses by ID).
- **Rationale**: Egyptian colleges use Latin (`CS 211`) and Arabic (`حاسب 211`) codes. Normalising removes
  duplicates that differ only in letter case, digit script, or repeated spaces (`cs  211` = `CS 211`). A
  single space is kept rather than removed, because regulations write codes both with and without it and
  the college's own spelling should be shown; `CS211` and `CS 211` are therefore different codes.
- **Alternatives considered**: removing all spaces (changes how the college writes its codes); Latin-only
  codes like division codes in 001 (rejects Arabic course codes that some colleges use); immutable codes
  (a typo could never be fixed, although no module stores the code).

## 12. Current-term concurrency

- **Decision**: `terms.setCurrent` locks all of the college's terms (`SELECT … FOR UPDATE`), clears the
  current flag, then sets it on the chosen term. A partial unique index guarantees at most one current term.
- **Rationale**: a single `UPDATE … SET is_current = (id = $1)` can fail transiently on the non-deferrable
  partial unique index, and two concurrent two-statement updates under READ COMMITTED can each miss the
  other's row; locking the set first serialises them (integration test: two concurrent calls → one current
  term, no error).

## 13. Permissions and navigation

- **Decision**: three permissions — `courses.view_own` (student), `catalog.manage` (student_affairs, admin),
  `roster.manage` (student_affairs, admin). Navigation gets "My courses" for students and an "Academic
  affairs" section for the two staff roles; the catalog is core, not tied to a module switch.
- **Rationale**: product spec §2 gives Student Affairs the student-administration work and the
  administration oversight; one shared right avoids a pilot college being blocked because it has not
  invited a Student Affairs account yet. Separate `catalog.manage`/`roster.manage` keep personal data (the
  roster) behind its own permission, so a later decision to narrow one does not affect the other.

## 14. The module read contract lives in `@masari/db`; only the core reads are implemented now

- **Decision**: the interface of FR-033 is a set of read-only functions in two namespaces of `@masari/db`,
  `catalog` and `roster` (`contracts/catalog-read.md`). This feature implements and integration-tests only
  the **core reads**: the ones 002's own screens use, plus the term, course, membership, teaching, and
  offerings reads whose shape follows from 002's data alone and which the roadmap MVPs of 004, 005, and 007
  certainly need (`currentTerm`, `findTerm`, `findCourse`, `studentCourses`, `isStudentInCourse`,
  `teacherCourses`, `isTeacher`, `termOfferings`, `verificationOf`). Reads whose shape depends on decisions
  the consumer makes — a course's student list (004/005 dashboards and exports), group sizes (007 sections
  and room capacity), the official list for a "not yet bought" report (004), course data for the
  regulations assistant (003, not in its MVP cut) — are **not** implemented here: catalog-read.md §5 lists
  them as deferred, and the consumer feature adds each one under the contract's extension rule (new
  function + integration test, in its own plan).
- **Rationale**: constitution IX requires a documented contract and VII forbids speculative code. Core reads
  next to the tables, with cross-college tests, stop each module from writing its own queries over catalog
  tables; reads with a single future caller would be written before anyone knows what that caller needs
  (paging, history, inactive courses), so their first caller defines them, still inside this contract.
- **Alternatives considered**: implementing every read a consumer might need (the first draft of this
  plan) — four functions without a caller and a heavier batch; documenting signatures only — the first
  consumer would define the core semantics for everyone, under its own feature's review.

## 15. Upload transport and limits

- **Decision**: the upload is a Server Action with a `file` field (constitution: no route handlers for
  uploads). The Server Action body limit is raised to `3mb` in `next.config.ts` (option
  `serverActions.bodySizeLimit`, under `experimental` in the Next.js versions known to the architect — check
  the pinned 16.4.6 docs), so the 2 MB rule is enforced by our validation with a translated message; the
  upload form also checks `file.size` in the browser before submitting (progressive enhancement: without
  JavaScript, a file over 3 MB gets the framework's rejection and the generic error page). The action checks
  `.csv` extension, size, and magic bytes before decoding; the `File`'s MIME type is ignored (browsers
  disagree on CSV MIME types).
- **Rationale**: constitution III ("uploads are type/size-checked and never executed"); the default 1 MB
  limit would reject a large college's list with an untranslated error.
- **Cost of the raised limit** (it is global, so it is a change to 001 behaviour, listed in spec.md
  Assumptions and contracts/server-actions.md §6): the framework reads and parses a Server Action body up to
  the limit **before** the action's guard and rate limit run, including for the public actions (sign-in,
  registration, password reset). An anonymous request can therefore make the server buffer and parse up to
  3 MB instead of 1 MB. Weighed: the hosting platform already accepts request bodies of about 4.5 MB for
  every route (so the raise does not create a new class of large request); form parsing is linear and a 3 MB
  body costs a few milliseconds of CPU and 3 MB of memory for the request's lifetime; public actions read
  only their few named fields and keep their per-IP rate limits. Accepted for the pilot; feature 009
  (security hardening) re-checks it with the rest of the request-size limits and can move the upload to
  its own limit if needed.

## 16. Reading account names (users table rule from 001)

- **Decision**: functions that need account names live in `repositories/users.ts`, take `tenantId`, and
  filter on it: `users.listNamesInTenant(tx, tenantId, userIds)` (teacher names, roster overview),
  `users.listStudentNames(tx, tenantId)` (matching during apply/preview), `users.listActiveFaculty(tenantId)`.
  `roster.ts` and `catalog.ts` never query `users` directly.
- **Rationale**: 001's compensating control for the RLS-exempt `users` table is that only `users.ts` and
  `sessions.ts` query it, with an explicit tenant filter and cross-college tests (data-model.md §1 of 001).

## 17. Levels in use

- **Decision**: `catalog.maxLevelInUse(tx)` = highest level over course placements and official-list
  entries; the settings action (001 PR-35) uses `max(studentProfiles.maxLevelInUse, catalog.maxLevelInUse)`
  for the `levels_in_use` rule.
- **Rationale**: FR-009 — otherwise reducing the number of levels would orphan placements and entries that
  no screen can show.

## 18. Testing approach additions

- **Decision**:
  - Unit: `lib/csv.ts` (decoding including Windows-1256 bytes built in the test by inverting
    `new TextDecoder('windows-1256')` over `0x80–0xFF`, BOM, UTF-16 and ZIP signatures, parser table),
    `features/roster/rules.ts` (headers, every issue code, level words, divisions by code/name, duplicates,
    row numbers), `@masari/db` `text.ts` / `roster/names.ts` / `roster/plan.ts`, catalog schemas/rules.
  - Integration: one file per new table (each with an explicit cross-college read case and write case)
    plus `catalog-read.int.test.ts` for the contract (cross-college cases for every function) and
    `roster-apply.int.test.ts` (replace semantics, links, sync, lock, concurrency, the same statement count
    for 10 and 2,000 rows via a query counter on the test connection).
  - End-to-end screen lists: screens whose path contains an id (a course, an import) get their data from
    a `prepare` hook in `apps/web/e2e/support/screens.ts` that creates fixed fixtures in the role-based
    access college through test support (contracts/routes.md §1); the demo college is never changed.
  - End-to-end: upload real byte buffers with `setInputFiles({ name, mimeType, buffer })`; fixtures are
    built in `apps/web/e2e/support/roster-files.ts` (no binary files committed); synthetic names only.
- **Rationale**: constitution II; no real student data in fixtures (constitution III).

## 19. Audit

- **Decision**: the web audit catalogue (`server/audit.ts`) gains the actions of data-model.md §5 and the
  target types `term`, `course`, `roster_import`. Per-student events are written only for single-student
  changes; an import's effect on many students is recorded as counts on `roster.import_applied`.
- **Rationale**: FR-032; an import of 5,000 students must not write 5,000 audit rows inside one request,
  and counts tell an auditor what happened.

## 20. Summary of decisions the owner should know

1. CSV: UTF-8 (with/without BOM) and Excel's Arabic "CSV" (Windows-1256) accepted; workbooks and UTF-16
   refused with instructions — §1.
2. Verified students cannot edit level/division; the administration cannot override; fixes go through the
   official list; a catalog manager can revoke a wrong verification — §2.
3. Imports run while the user waits, capped at 10,000 rows / 2 MB, with a fixed number of database
   statements — an exception to constitution VI until the job runner of 003 exists; **needs the owner's
   acceptance before this documentation is merged** — §3.
4. Import = full replacement with a preview; a second confirmation when more than a fifth of the list would
   be removed; drafts expire after 24 hours — §5.
5. Uploaded files are never stored; only the four columns are kept; the daily purge of expired drafts comes
   with 003 — §6.
6. Name matching: the account name must start with the first three official names after Arabic
   normalisation; renames re-checked at most 5 times a day; mismatches reviewed by a person — §7.
7. Courses are placed once in the study plan; teachers are assigned per term; the current term is set by
   hand — §9.
8. Student codes are compared exactly, as in 001 — §1.
9. The form-size limit grows to 3 MB for every form — §15.
