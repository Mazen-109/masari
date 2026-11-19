# Contract: Catalog and Academic-Profile Reads for Modules

**Feature**: `002-academic-catalog` · Implements spec FR-033 (and FR-011, FR-012 for the student screens) ·
Constitution IX ("data passed between modules goes through an explicit, documented contract")

This is the **only** way a module (Mu'eed 003/007/008, Kitabi 004, CodeJudge 005/006, Mizan 010, and the AI
layer) reads the course catalog, teacher assignments, a student's courses, and verification state. Modules
MUST NOT query the catalog or roster tables themselves and MUST NOT keep their own copy of a student's
level, division, or courses (constitution IX). If a module needs a read that is not listed here, the feature
that adds it extends this contract (new function + integration test) in its own plan.

## 1. General rules

- The functions are exported by `@masari/db` in two namespaces, `catalog` (`src/repositories/catalog.ts`)
  and `roster` (`src/repositories/roster.ts`, read part). They are **read-only**.
- Each takes the transaction handle `tx` from the caller's `withTenant({ tenantId, userId }, tx => …)` as
  its first argument; row-level security limits every result to that college. A transaction is one
  connection: call them one after another (CLAUDE.md).
- **Graceful degradation**: missing data is never an error. An unknown or malformed ID, a college without
  terms or courses, a student without a profile, or a summer term returns `null`, `[]`, or `false` as
  stated. Modules MUST handle these results (e.g. "no courses yet") instead of failing.
- The catalog is core data: it does not depend on any module switch (spec Clarifications), and these
  functions work whichever modules are enabled.
- Level and division of a student come from the shared profile (`student_profiles`), never from the
  official list; for a verified student both are equal by construction (research.md §2).
- Results contain IDs, codes, and catalog data — never account names, emails, or official names, except
  `roster.verificationOf` / `roster.listedStudents` (§3), which return the official name for the purposes
  stated there. Callers that display people's names resolve them with `users.listNamesInTenant`.
- Every function of §2 and §3 has a cross-college integration test (`packages/db/test/catalog-read.int.test.ts`):
  called inside college A's context with IDs of college B it returns `null` / `[]` / `false`.
- **Stability**: 002 PR-10 delivers every `catalog` function except `courseStudents` and `groupSizes`;
  PR-13 adds those two (both need the official-list table: `verified`, `listed`) and the `roster` reads. From those merges the signatures
  and semantics below are binding. A breaking change
  needs a contract change in the feature that makes it, with every consumer updated in the same PR.

## 2. Types and `catalog` functions

```ts
export type TermKind = 'first' | 'second' | 'summer';
export type Term = { id: string; startYear: number; kind: TermKind;
                     startsOn: string /* YYYY-MM-DD */; endsOn: string; isCurrent: boolean };
export type CourseSummary = { id: string; code: string; nameAr: string; nameEn: string;
                              creditHours: number; isActive: boolean };
export type CourseTopic = { id: string; position: number; title: string };
export type CourseDetail = CourseSummary & { description: string; topics: CourseTopic[]; updatedAt: Date };
export type StudyGroup = { level: number; divisionId: string };
```

| § | Function | Returns | Semantics | First consumers |
|---|---|---|---|---|
| 2.1 | `currentTerm(tx)` | `Term \| null` | The college's current term. | 004, 005, 007, "My courses" |
| 2.2 | `findTerm(tx, termId)` | `Term \| null` | Any term of the college. | 005, 007 |
| 2.3 | `findCourse(tx, courseId)` | `CourseDetail \| null` | Any course, active or not (history), topics by position. | 003, 004, 005, 010 |
| 2.4 | `studentCourses(tx, userId, opts?: { termId?: string })` | `{ term: Term \| null; courses: Array<CourseSummary & { teacherIds: string[] }> }` | Term = `opts.termId` or the current term. Courses = **active** courses with a placement for the student's `(level, division_id)` and the term's kind, ordered by `code`; `teacherIds` = teachers in that term. `courses: []` when there is no term, the term is summer, the user has no academic profile, or nothing is placed. | "My courses", 004, 005 |
| 2.5 | `isStudentInCourse(tx, userId, courseId, termId)` | `boolean` | `true` iff the course is in `studentCourses(tx, userId, { termId }).courses`. | 004, 005 |
| 2.6 | `teacherCourses(tx, userId, termId)` | `CourseSummary[]` | Active courses the user is assigned to in the term, by `code`. | 005 |
| 2.7 | `isTeacher(tx, userId, courseId, termId)` | `boolean` | An assignment exists for (term, course, user) and the course is active. Role and account status are **not** checked here — the caller's permission guard does that. | 005 |
| 2.8 | `courseStudents(tx, courseId, termId, page: { afterStudentCode?: string; limit: number })` | `Array<{ userId: string; studentCode: string; level: number; divisionId: string; verified: boolean }>` | Students (profiles) whose `(level, division_id)` has a placement of the **active** course with the term's kind; keyset-paginated by `student_code` (`limit` 1–1,000, else `RangeError`). `[]` for a summer or unknown term. | 004 (dashboard), 005 |
| 2.9 | `termOfferings(tx, termId)` | `Array<{ course: CourseSummary; groups: StudyGroup[]; teacherIds: string[] }>` | Active courses with at least one placement whose kind equals the term's kind, each with all its matching groups (by level, then division `sort_order`, `code`) and the term's teachers; by `code`. `[]` for summer or unknown term. Two statements. | 007 |
| 2.10 | `groupSizes(tx)` | `Array<StudyGroup & { registered: number; listed: number }>` | Per `(level, division)`: number of academic profiles (`registered`) and of official-list entries (`listed`); groups with both counts 0 are omitted. | 007 (room capacity), 004 |
| 2.11 | `knowledgeCourses(tx, opts?: { updatedSince?: Date; limit?: number })` | `Array<CourseDetail & { placements: Array<StudyGroup & { termKind: 'first' \| 'second' }> }>` | Active courses (optionally only those whose `updated_at` > `updatedSince`; topic and placement changes bump it), by `code`, at most `limit` (default and maximum 500). For the regulations assistant's knowledge base. | 003 |

Display helpers (web, `apps/web/src/lib/academic.ts`, used by 002 screens and available to modules):
`termLabel(term, locale)` («الفصل الدراسي الأول 2026/2027» / "First term 2026/2027"), `courseName(course,
locale)` (`nameAr` / `nameEn`).

## 3. `roster` functions (read part)

```ts
export type Verification =
  | { status: 'verified'; method: 'auto' | 'manual'; verifiedAt: Date;
      official: { studentCode: string; fullName: string; level: number; divisionId: string } }
  | { status: 'name_mismatch' | 'not_in_roster' }
  | { status: 'no_profile' };
```

| § | Function | Returns | Semantics | First consumers |
|---|---|---|---|---|
| 3.1 | `verificationOf(tx, userId)` | `Verification` | The student's derived status (data-model.md §3.7). | profile and home screens; 004 (the watermark uses `official.fullName` for verified students) |
| 3.2 | `listedStudents(tx, filter: { level?: number; divisionId?: string; afterStudentCode?: string; limit: number })` | `Array<{ studentCode: string; officialName: string; level: number; divisionId: string; userId: string \| null }>` | Official-list entries, keyset-paginated by `student_code` (`limit` 1–1,000); `userId` is the linked (verified) account or `null`. | 004 ("students who have not bought yet") |

**Privacy rule for consumers**: a screen shown to a student MUST NOT distinguish `name_mismatch` from
`not_in_roster`, and MUST NOT show official data unless the status is `verified` (spec FR-027).
`officialName` / `official.fullName` are personal data: never logged, never sent to an AI provider.

## 4. Consumer map

| Feature | Uses | Purpose |
|---|---|---|
| 003 Mu'eed assistant | `knowledgeCourses`, `findCourse` | Course descriptions and topics as an additional knowledge source (re-ingest by `updatedSince`) |
| 004 Kitabi | `currentTerm`, `studentCourses`, `isStudentInCourse`, `courseStudents`, `listedStudents`, `verificationOf` | Books of a student's courses; purchase eligibility; not-yet-bought list; watermark name |
| 005 CodeJudge | `currentTerm`, `findTerm`, `findCourse`, `teacherCourses`, `isTeacher`, `studentCourses`, `isStudentInCourse`, `courseStudents` | Assignments per course and term; who may create, submit, and be graded |
| 007 Timetable | `currentTerm`, `findTerm`, `termOfferings`, `groupSizes` | A term's courses with their level/division groups and teachers; group sizes for room capacity |
| 010 Mizan (later) | `findCourse` | Topics (stable IDs) for the table of specifications |

## 5. Not in this contract (decided in later features)

Course sections and rooms (007), per-student electives and carried-over courses (roadmap *Later*), grades
(005 and later), course prerequisites. When one of them is added, a student's courses may come from more
than placements; consumers already go through `studentCourses` / `isStudentInCourse`, so only those
functions change.
