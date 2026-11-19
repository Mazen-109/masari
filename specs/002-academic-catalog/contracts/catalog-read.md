# Contract: Catalog and Academic-Profile Reads for Modules

**Feature**: `002-academic-catalog` · Implements spec FR-033 (and FR-011, FR-012, FR-027 for 002's own
screens) · Constitution IX ("data passed between modules goes through an explicit, documented contract") ·
Scope decision: research.md §14

This is the **only** way a module (Mu'eed 003/007/008, Kitabi 004, CodeJudge 005/006, Mizan 010, and the AI
layer) reads the course catalog, teacher assignments, a student's courses, and verification state. Modules
MUST NOT query the catalog or roster tables themselves and MUST NOT keep their own copy of a student's
level, division, or courses (constitution IX).

**Extension rule.** If a module needs a read that is not listed in §2–§3, the feature that needs it adds it
to this contract in its own plan and PR: a new function in the same namespace, following §1, with its
semantics written into this file and its cases (including a cross-college case) added to
`packages/db/test/catalog-read.int.test.ts`. §5 lists reads already known to be needed later, with notes
from the 002 review, so that their first consumer starts from them.

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
- **No history**: membership is computed from the student's **current** profile (level, division) and the
  current study plan. For a past term, `studentCourses` and `isStudentInCourse` answer "which courses would
  this student take in a term of that kind today", not what they took then; 002 stores no enrolment history.
  A consumer that needs history (grades, past purchases) keeps its own record of what happened (e.g.
  CodeJudge stores submissions with their course and term).
- Results contain IDs, codes, and catalog data — never account names, emails, or official names, except
  `roster.verificationOf` (§3), which returns the official name for the purposes stated there. Callers that
  display people's names resolve them with `users.listNamesInTenant`.
- Every function of §2 and §3 has a cross-college integration test (`packages/db/test/catalog-read.int.test.ts`):
  called inside college A's context with IDs of college B it returns `null` / `[]` / `false`.
- **Stability**: 002 PR-10 delivers every function of §2; PR-21 delivers `roster.verificationOf` (§3,
  first used by 002's profile screen). From those merges the signatures and semantics below are binding. A
  breaking change needs a contract change in the feature that makes it, with every consumer updated in the
  same PR.

## 2. Types and `catalog` functions

```ts
export type TermKind = 'first' | 'second' | 'summer';                 // exported since 002 PR-2
export type Term = { id: string; startYear: number; kind: TermKind;   // exported since 002 PR-2
                     startsOn: string /* YYYY-MM-DD */; endsOn: string; isCurrent: boolean };
export type CourseSummary = { id: string; code: string; nameAr: string; nameEn: string;  // since PR-4
                              creditHours: number; isActive: boolean };
export type CourseTopic = { id: string; position: number; title: string };               // since PR-4
export type CourseDetail = CourseSummary & { description: string; topics: CourseTopic[]; updatedAt: Date };
export type StudyGroup = { level: number; divisionId: string };                          // new in PR-10
```

| § | Function | Returns | Semantics | Consumers (roadmap MVP) |
|---|---|---|---|---|
| 2.1 | `currentTerm(tx)` | `Term \| null` | The college's current term. | 002 "My courses"; 004, 005, 007 |
| 2.2 | `findTerm(tx, termId)` | `Term \| null` | Any term of the college. | 005, 007 |
| 2.3 | `findCourse(tx, courseId)` | `CourseDetail \| null` | Any course, active or not (history), topics by position. | 002 course page; 004 (books linked to courses), 005 |
| 2.4 | `studentCourses(tx, userId, opts?: { termId?: string })` | `{ term: Term \| null; courses: Array<CourseSummary & { teacherIds: string[] }> }` | Term = `opts.termId` or the current term. Courses = **active** courses with a placement for the student's current `(level, division_id)` and the term's kind, ordered by `code`; `teacherIds` = teachers in that term. `courses: []` when there is no term, the term is summer, the user has no academic profile, or nothing is placed. No history (§1). | 002 "My courses"; 004, 005 |
| 2.5 | `isStudentInCourse(tx, userId, courseId, termId)` | `boolean` | `true` iff the course is in `studentCourses(tx, userId, { termId }).courses`. No history (§1). | 002 course page; 004, 005 |
| 2.6 | `teacherCourses(tx, userId, termId)` | `CourseSummary[]` | Active courses the user is assigned to in the term, by `code`. | 005 |
| 2.7 | `isTeacher(tx, userId, courseId, termId)` | `boolean` | An assignment exists for (term, course, user) and the course is active. Role and account status are **not** checked here — the caller's permission guard does that. | 005 |
| 2.8 | `termOfferings(tx, termId)` | `Array<{ course: CourseSummary; groups: StudyGroup[]; teacherIds: string[] }>` | Active courses with at least one placement whose kind equals the term's kind, each with all its matching groups (by level, then division `sort_order`, `code`) and the term's teachers; by `code`. `[]` for summer or unknown term. Two statements. | 007 |

Display helpers (web, `apps/web/src/lib/academic.ts`, used by 002 screens and available to modules):
`termLabel(term, locale)` («الفصل الدراسي الأول 2026/2027» / "First term 2026/2027"), `courseName(course,
locale)` (`nameAr` / `nameEn`).

## 3. `roster` function (read part)

```ts
export type Verification =
  | { status: 'verified'; method: 'auto' | 'manual'; verifiedAt: Date;
      official: { studentCode: string; fullName: string; level: number; divisionId: string } }
  | { status: 'name_mismatch' | 'not_in_roster' }
  | { status: 'no_profile' };
```

| § | Function | Returns | Semantics | Consumers |
|---|---|---|---|---|
| 3.1 | `verificationOf(tx, userId)` | `Verification` | The derived status of one account (data-model.md §3.7): linked entry → `verified`; an entry with the profile's code but not linked (including after a revocation) → `name_mismatch`; profile without entry → `not_in_roster`; no academic profile → `no_profile`. (`not_registered` exists only in the catalog managers' overview, which lists entries, not accounts.) | 002 profile and home screens; 004 (the watermark uses `official.fullName` for verified students) |

**Privacy rule for consumers**: a screen shown to a student MUST NOT distinguish `name_mismatch` from
`not_in_roster`, and MUST NOT show official data unless the status is `verified` (spec FR-027).
`official.fullName` is personal data: never logged, never sent to an AI provider.

## 4. Consumer map (roadmap MVPs)

| Feature | Uses | Purpose |
|---|---|---|
| 004 Kitabi | `currentTerm`, `findCourse`, `studentCourses`, `isStudentInCourse`, `verificationOf` | Books of a student's courses; purchase eligibility; watermark name |
| 005 CodeJudge | `currentTerm`, `findTerm`, `findCourse`, `teacherCourses`, `isTeacher`, `studentCourses`, `isStudentInCourse` | Assignments per course and term; who may create and who may submit |
| 007 Timetable | `currentTerm`, `findTerm`, `termOfferings` | A term's courses with their level/division groups and teachers |

003's MVP cut does not use the catalog; its course-description source is deferred (§5).

## 5. Deferred reads (added by their consumer under the extension rule)

| Read | First consumer | Notes for the consumer's plan (from the 002 review) |
|---|---|---|
| `courseStudents(tx, courseId, termId, page)` — students (profiles) whose `(level, division)` has a placement of the active course with the term's kind, with `verified` | 004 (dashboard / not-yet-bought) or 005 (grade export), whichever comes first | Keyset pagination by `student_code` (`limit` 1–1,000, `RangeError` otherwise); `[]` for summer or unknown term; no history (§1) — a past term is computed from today's profiles, which a grade export must not rely on. |
| `groupSizes(tx)` — per `(level, division)`: registered profiles and official-list entries | 007 (room capacity) | Omit groups with both counts 0; decide whether capacity uses `registered`, `listed`, or the larger. |
| `listedStudents(tx, filter)` — official-list entries with the linked account or `null` | 004 (students who have not bought yet) | Keyset pagination by `student_code`; returns the official name, so §3's privacy rule applies; filter by level/division. |
| `knowledgeCourses(tx, opts)` — courses with description, topics, and placements for the regulations assistant | 003 when course descriptions become a knowledge source (not in its MVP cut) | Return **inactive** courses too when `updatedSince` is given, so a deactivated course can be removed from the index; order by `(updated_at, id)` with a keyset cursor instead of `code` + `limit`, so a consumer can page past any limit. `updated_at` is already bumped by topic and placement writes (data-model.md §2). |

## 6. Not in this contract (decided in later features)

Course sections and rooms (007), per-student electives and carried-over courses (roadmap *Later*), grades
(005 and later), course prerequisites, enrolment history. When one of them is added, a student's courses may
come from more than placements; consumers already go through `studentCourses` / `isStudentInCourse`, so only
those functions change.
