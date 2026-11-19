---

description: "Task list for feature 002 — Academic Catalog & Student Roster, grouped into PR batches"
---

# Tasks: Academic Catalog & Student Roster

**Input**: Design documents from `/specs/002-academic-catalog/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all binding — see plan.md
"Implementation latitude"), quickstart.md; feature 001 merged (its conventions, helpers, and e2e support are
reused unchanged unless a task says otherwise); **the owner's answers** to spec.md Clarifications and to the
principle VI exception (plan.md Complexity Tracking), recorded when the owner merges this documentation PR.

**Tests**: MANDATORY (constitution II). Every batch contains the tests for its own behaviour; a batch
without its tests is not done.

**Organization**: tasks are grouped by phase (Foundational → one phase per user story → Polish) and, inside
each phase, into **PR batches**. One PR batch = one branch = one pull request = one implementer assignment.
Implement batches strictly in numeric order; each starts from up-to-date `main` after the previous batch is
merged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can be done in parallel with other [P] tasks of the same batch (different files, no dependency)
- **[Story]**: `[US1]`…`[US5]` in user-story phases only
- Paths are relative to the repository root. `(FR-nnn)` = requirement covered (spec.md of this feature).

## Rules for every batch

1. Branch `002-prNN-<slug>` (slug given per batch); PR title `[002 PR-N] <batch title>`.
2. Do exactly the batch's tasks; tick them `[x]` in this file in the same PR.
3. Size target ≤ ~400 changed lines, not counting `pnpm-lock.yaml`, generated migrations/snapshots, copied
   shadcn/ui files, `messages/*.json`, and end-to-end spec files (`apps/web/e2e/**`). The estimate per batch
   is a guide; batches marked "Size note expected" are known to be larger. If the counted diff is larger,
   **do not stop and do not leave out tests**: finish the batch and add a **Size note** to the PR
   description (counted lines, and why the batch cannot be smaller).
4. Every user-facing string goes into both `apps/web/messages/ar.json` and `en.json` (namespaces in
   contracts/routes.md §4), Arabic written natively with the fixed terms listed there.
5. Every new tenant-scoped table ships in its batch with `tenant_id`, forced RLS + `tenant_isolation`,
   grants exactly as data-model.md §1, a `table-classification.ts` entry, and **explicit cross-college
   isolation tests: one read case and one write case per table** (data-model.md §1, contracts/db-api.md §4).
   Never run queries on one `tx` in parallel.
6. "Accept" lines are the reviewer's checklist. In addition, every batch must pass `pnpm check`,
   `pnpm build`, `pnpm test:e2e`, and all CI jobs; every PR states the CI `e2e` job's duration.
7. End-to-end specs run in Arabic by default; each user story's spec runs its main success scenario once
   under `/en` as well. Specs import `test` from `apps/web/e2e/support/fixtures.ts`, create their own college
   for college-level data (**never change the demo college**), use synthetic names only, and forge
   submissions only with `apps/web/e2e/support/forge.ts` (001 contracts/server-actions.md §6).
8. Every new screen is added to `apps/web/e2e/support/screens.ts` exactly as contracts/routes.md §1.1 says:
   static paths directly; screens with an id through a `prepare` hook that creates fixtures in the
   role-based access college with `ensureScreenFixtures` (never in the demo college).
9. Logs never contain student codes, names, course titles/descriptions, or CSV contents; a review of every
   new `log.*` call is part of each Accept line implicitly.
10. Never commit secrets or real student data; fixtures and seeds use invented names and codes.
11. Test-support functions (`packages/db/src/admin/test-support.ts`) come with a refusal case for non-test
    databases in `packages/db/test/test-support.int.test.ts` and a wrapper in `apps/web/e2e/support/db.ts`.

## Batch overview

| Batch | Phase | Title | Est. lines |
|---|---|---|---|
| PR-1 | Foundational | Catalog permissions, constants, Arabic text helpers | 240 |
| PR-2 | US1 | Terms data layer | 300 |
| PR-3 | US1 | Terms screen | 400 |
| PR-4 | US1 | Courses and topics data layer | 400 |
| PR-5 | US1 | Course list, course form, screen fixtures | 450 (Size note expected) |
| PR-6 | US1 | Course topics editor | 300 |
| PR-7 | US2 | Placements and teaching data layer | 400 |
| PR-8 | US2 | Study plan on the course screen | 350 |
| PR-9 | US2 | Teachers on the course screen | 350 |
| PR-10 | US3 | Module read contract (core reads) | 330 |
| PR-11 | US3 | My courses | 380 |
| PR-12 | US4 | Name matching and the apply plan (pure) | 350 |
| PR-13 | US4 | Roster tables and the verified lock | 400 |
| PR-14 | US4 | Import repository | 400 |
| PR-15 | US4 | CSV reading: encodings and parser | 300 |
| PR-16 | US4 | Roster file rules | 400 |
| PR-17 | US4 | Upload and validation report | 500 (Size note expected) |
| PR-18 | US4 | Apply an import | 500 (Size note expected) |
| PR-19 | US5 | Verification overview, manual confirmation, revocation | 480 (Size note expected) |
| PR-20 | US5 | Automatic verification on profile changes | 350 |
| PR-21 | US5 | Verified status on the profile and home screens; privacy notice | 340 |
| PR-22 | Polish | Demo data, traceability, final sweep | 250 |

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: permissions, shared constants, and the Arabic normalisation every later batch uses.
**No user-story batch may start before PR-1 is merged, and PR-1 starts only after the owner has answered
the questions recorded in spec.md Clarifications and plan.md Complexity Tracking.**

### PR-1 — Catalog permissions, constants, Arabic text helpers · branch `002-pr01-foundations`

- [ ] T001 [P] Add `TERM_KINDS`, `PLAN_TERM_KINDS`, `ROSTER_IMPORT_STATUSES`, `VERIFICATION_METHODS`, `VERIFICATION_STATUSES`, `COURSE_LIMITS`, `ROSTER_LIMITS` (incl. `largeRemovalPercent`) and their types to `packages/db/src/constants.ts` exactly as data-model.md "New constants", export them from `packages/db/src/index.ts`, and extend `packages/db/src/constants.test.ts` (values and order)
- [ ] T002 [P] Create `packages/db/src/text.ts` (`toWesternDigits`, `stripInvisible`, `normalizeArabicText`, contracts/db-api.md §1.1, research.md §1, §7) with `packages/db/src/text.test.ts` (table: every invisible code point of the list, NFKC of Arabic presentation forms (e.g. `ﻣﺤﻤﺪ` → `محمد`) and full-width digits, tashkeel incl. shadda, tatweel, `أ إ آ ٱ`, `ة`, `ى`, `ؤ`, `ئ`, both Arabic digit ranges, Latin case, punctuation and `_`, repeated and surrounding whitespace, empty string); export the three from `packages/db/src/index.ts`
- [ ] T003 Add `courses.view_own`, `catalog.manage`, `roster.manage` to `apps/web/src/server/auth/permissions.ts` (contracts/permissions.md §1; not module permissions) and extend `apps/web/src/server/auth/permissions.test.ts` to the 52-cell table (FR-030)

**Accept**: the permission test asserts exactly 52 cells and still fails when a permission is added without matrix entries · each new permission has a granted and a denied role · `normalizeArabicText('أَحْمَدُ‏  عليّ')` is `'احمد علي'`, `stripInvisible('‎2023‏')` is `'2023'`, and `toWesternDigits('٢٠٢٣-۱')` is `'2023-1'` (tests) · no user-visible change

---

## Phase 2: User Story 1 — A catalog manager sets up terms and courses (Priority: P1) 🎯 MVP

**Goal**: terms with one current term; courses with bilingual names, credit hours, description, ordered topics.

**Independent Test**: quickstart.md V1.

### PR-2 — Terms data layer · branch `002-pr02-terms-data`

- [ ] T004 [US1] Create `packages/db/src/schema/academic-terms.ts` (data-model.md §3.1: `CHECK (start_year BETWEEN 2000 AND 2100)`, `CHECK (kind IN ('first','second','summer'))`, `CHECK (ends_on > starts_on)`, `UNIQUE (tenant_id, start_year, kind)`, `UNIQUE (tenant_id, id)`), export it from `packages/db/src/schema/index.ts`, generate the migration, add custom SQL migration `academic_terms_security` (RLS enabled + forced, `tenant_isolation`, partial unique index `academic_terms_one_current ON (tenant_id) WHERE is_current`, grants `SELECT, INSERT, UPDATE`), and the classification entry (FR-001, FR-002, FR-035)
- [ ] T005 [US1] Create `packages/db/src/repositories/terms.ts` (`list`, `findById`, `create`, `update`, `setCurrent` exactly as contracts/db-api.md §2.1, locking order of data-model.md §2, `TermQueryError` without parameters) and export namespace `terms` and types `Term`, `TermKind` from `packages/db/src/index.ts` (FR-001–FR-003)
- [ ] T006 [US1] Add `createTerm` to `packages/db/src/admin/test-support.ts` (contracts/db-api.md §3; rule 11) and create `packages/db/test/terms.int.test.ts` covering every statement listed for it in contracts/db-api.md §4 (isolation read and write included)

**Accept**: two concurrent `setCurrent` calls on different terms → exactly one current term and no error · `term_exists` within a college, the same term in two colleges both `ok` · `findById`/`update`/`setCurrent` with another college's id → `null`/`not_found` · isolation read and write cases for `academic_terms` · rls-meta passes · `createTerm` refuses a database not named `masari_test…`/`masari_e2e…`

### PR-3 — Terms screen · branch `002-pr03-terms-screen`

- [ ] T007 [US1] Add `term_exists`, `date_order` to `FieldErrorCode` in `apps/web/src/lib/result.ts`; create `apps/web/src/features/terms/schemas.ts` (`createTermSchema`, `updateTermSchema`, `setCurrentTermSchema` with the field rules of contracts/server-actions.md §3: `startYear` 2000–2100 in Western or Arabic-Indic digits, `kind`, real `YYYY-MM-DD` dates, `endsOn > startsOn` → `date_order`) with `schemas.test.ts`; create `apps/web/src/lib/academic.ts` (`academicYearLabel(startYear)` → `2026/2027`, `termLabel(term, t)`, `courseName(course, locale)`) with `academic.test.ts`
- [ ] T008 [US1] Add the `term` target type and `term.created`, `term.updated {fields}`, `term.made_current {previousTermId}` to `AUDIT_CATALOGUE` in `apps/web/src/server/audit.ts` (+ test case), and create `apps/web/src/features/terms/actions.ts` with `createTermAction`, `updateTermAction`, `setCurrentTermAction` (contracts/server-actions.md §4.1) (FR-001, FR-002, FR-032)
- [ ] T009 [US1] Create `apps/web/src/app/[locale]/(app)/catalog/terms/page.tsx` (`requirePermission('catalog.manage', '/catalog/terms')`), `apps/web/src/features/terms/components/term-form.tsx` (add; edit in a `dialog`; year input with the live `2026/2027` label in an LTR isolate), `terms-table.tsx` (caption; current badge with text; edit and "make current" actions); add the "Academic affairs" section with the Terms entry to `apps/web/src/components/shell/nav-items.ts` (+ `nav-items.test.ts`) and a catalog shortcut card for `catalog.manage` on the dashboard (`apps/web/src/features/dashboard/components/academic-shortcuts.tsx`); namespaces `catalog.terms`, `common.termKinds`, `nav`, `errors`, `meta` (FR-003, FR-031)
- [ ] T010 [US1] Create `apps/web/e2e/catalog-terms.spec.ts`: US1 scenarios 1–3 as Student Affairs (scenario 1 also under `/en`); duplicate term; end date before start; forged `termId` of another college → `not_found`, nothing changed; faculty and student: `/ar/catalog/terms` → 404 and the three actions → `forbidden` through `submitAs`; audit rows; add `/catalog/terms` to `SIGNED_IN_SCREENS` (routes.md §1.1) and the new nav entries to the expectations of `apps/web/e2e/rbac.spec.ts`

**Accept**: US1 scenarios 1–3 and the terms part of 9 pass · the current-term badge is text, not colour only · years render left-to-right inside Arabic text (screenshot) · audit rows `term.created`, `term.updated {fields}`, `term.made_current` written · ar + en screenshots in the PR

### PR-4 — Courses and topics data layer · branch `002-pr04-courses-data`

- [ ] T011 [US1] Create `packages/db/src/schema/courses.ts` and `packages/db/src/schema/course-topics.ts` (data-model.md §3.2–3.3: `CHECK (code = btrim(code) AND char_length(code) BETWEEN 2 AND 20)`, names `BETWEEN 1 AND 120`, `CHECK (credit_hours BETWEEN 0 AND 12)`, `CHECK (char_length(description) <= 4000)`, `UNIQUE (tenant_id, code)`, `UNIQUE (tenant_id, id)`, topics `CHECK (position BETWEEN 1 AND 50)`, `CHECK (char_length(title) BETWEEN 1 AND 200)`, composite FK to `courses (tenant_id, id)`), generated migration, custom SQL migration `courses_security` (RLS + `tenant_isolation` on both; `course_topics_course_position_unique UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED`; grants courses `SELECT, INSERT, UPDATE`, topics `SELECT, INSERT, UPDATE, DELETE`), classification entries (FR-004–FR-006, FR-035)
- [ ] T012 [US1] Create `packages/db/src/repositories/courses.ts` (`list`, `findById`, `create`, `update`, `setActive`, `addTopic`, `renameTopic`, `moveTopic`, `removeTopic` exactly as contracts/db-api.md §2.2; topic rules of data-model.md §3.3; every topic write sets the course's `updated_at`; `CourseQueryError`), export namespace `courses` and types `CourseSummary`, `CourseDetail`, `CourseTopic` (FR-004–FR-007)
- [ ] T013 [US1] Add `createCourse` to `packages/db/src/admin/test-support.ts` (rule 11) and create `packages/db/test/courses.int.test.ts` covering every statement listed for it in contracts/db-api.md §4 (isolation read and write for `courses` **and** `course_topics`)

**Accept**: 50 topics then `too_many` · two concurrent `addTopic` calls get distinct positions · after any move or removal positions are exactly `1…n` · `list` issues two statements · search for `%` matches only a literal `%` · a course id of another college → `null` everywhere · isolation read and write cases for both tables · rls-meta passes

### PR-5 — Course list, course form, screen fixtures · branch `002-pr05-courses-screens` · Size note expected

- [ ] T014 [US1] Create `apps/web/src/features/courses/rules.ts` (`normalizeCourseCode`, data-model.md §3.2) and `apps/web/src/features/courses/schemas.ts` (`createCourseSchema`, `updateCourseSchema`, `setCourseActiveSchema`, `coursesFilterSchema` for `q`, `status`, `page`) with tests (`cs  211` → `CS 211`, `حاسب ٢١١` → `حاسب 211`, invalid characters, length after normalisation, Arabic-Indic credit hours) (FR-004, FR-007)
- [ ] T015 [US1] Add the `course` target type and `course.created`, `course.updated {fields}`, `course.activated`, `course.deactivated` to `apps/web/src/server/audit.ts`, and create `apps/web/src/features/courses/actions.ts` with `createCourseAction`, `updateCourseAction`, `setCourseActiveAction` (contracts/server-actions.md §4.2) (FR-004, FR-005, FR-032)
- [ ] T016 [US1] Create `apps/web/src/app/[locale]/(app)/catalog/courses/page.tsx` (filters `q`, `status`; table; pagination keeping filters; past-the-end redirect), `catalog/courses/new/page.tsx`, `catalog/courses/[courseId]/page.tsx` (details section only; non-uuid or unknown id → `notFound()`), and `apps/web/src/features/courses/components/{course-form,courses-table,courses-filters,course-status-form}.tsx` (code `dir="ltr"`, Arabic name `dir="rtl"`, English name `dir="ltr"`, description `dir="auto"`); Courses nav entry and shortcut; namespace `catalog.courses` (FR-005, FR-007)
- [ ] T017 [US1] Screen fixtures (contracts/routes.md §1.1): add the optional `prepare` field and the `screenPath(page, screen)` helper to `apps/web/e2e/support/screens.ts` and use it in `a11y.spec.ts`, `security-headers.spec.ts`, and `responsive.spec.ts` (the visited path only); add `ensureScreenFixtures` (contracts/db-api.md §3, current term + course `A11Y 101` with two topics) to `packages/db/src/admin/test-support.ts` with its wrapper (rule 11) and an idempotence case (two concurrent calls) in `packages/db/test/test-support.int.test.ts`
- [ ] T018 [US1] Create `apps/web/e2e/catalog-courses.spec.ts` (part 1): US1 scenarios 4, 5, 7 and the search/status part of 8 (21+ courses created with `createCourse`), scenario 4 also under `/en`; no delete control exists; forged `courseId` of another college → `not_found`; non-admin roles → 404 / `forbidden`; audit rows; add `/catalog/courses`, `/catalog/courses/new` (static) and `/catalog/courses/[courseId]` (with `prepare`, role `student_affairs`) to `SIGNED_IN_SCREENS`, and `/ar/catalog/courses` (admin, 300 KB) to `apps/web/e2e/perf-budget.spec.ts`

**Accept**: US1 scenarios 4, 5, 7, 8 (search and status filters) pass · filters and pagination work without JavaScript · audit rows `course.created`, `course.updated {fields}`, `course.deactivated`, `course.activated` written · the course screen is scanned by a11y/CSP/responsive through `prepare`, and the demo college has no new rows after a full e2e run (state how verified) · ar + en screenshots

### PR-6 — Course topics editor · branch `002-pr06-topics`

- [ ] T019 [US1] Add `addTopicSchema`, `renameTopicSchema`, `moveTopicSchema`, `removeTopicSchema` (+ tests) to `apps/web/src/features/courses/schemas.ts`, the four `course.topic_*` actions to `apps/web/src/server/audit.ts`, and `addTopicAction`, `renameTopicAction`, `moveTopicAction`, `removeTopicAction` to `apps/web/src/features/courses/actions.ts` (contracts/server-actions.md §4.2) (FR-006, FR-032)
- [ ] T020 [US1] Create `apps/web/src/features/courses/components/course-topics.tsx` (`<ol>` of topics, `dir="auto"` titles; rename `dialog`; move-up/move-down buttons whose accessible names include the topic title and that keep focus on the moved topic; remove; add form) and add the topics section to the course page; namespace `catalog.topics` (FR-006)
- [ ] T021 [US1] Extend `apps/web/e2e/catalog-courses.spec.ts` (part 2): US1 scenario 6; the 51st topic → `too_many`; keyboard-only reorder with focus checks; forged `topicId` of another course → `not_found`; actions refused for non-admin roles; audit rows

**Accept**: US1 scenario 6 passes · every topic form works without JavaScript · after "move up" focus stays on that topic's button (asserted) · audit rows for the four topic actions

---

## Phase 3: User Story 2 — Study-plan placements and teachers (Priority: P1)

**Goal**: place courses for level + division + term kind; assign faculty members per term.

**Independent Test**: quickstart.md V2.

### PR-7 — Placements and teaching data layer · branch `002-pr07-plan-data`

- [ ] T022 [US2] Create `packages/db/src/schema/course-placements.ts` and `packages/db/src/schema/course-teachers.ts` (data-model.md §3.4–3.5: `CHECK (level BETWEEN 1 AND 7)`, `CHECK (term_kind IN ('first','second'))`, composite FKs to `courses`, `divisions`, `academic_terms`, `user_id` FK → `users` ON DELETE CASCADE, `assigned_by` ON DELETE SET NULL, the two unique constraints and indexes), generated migration, custom SQL migration `course_plan_security` (RLS + `tenant_isolation`; grants `SELECT, INSERT, DELETE` on both), classification entries (FR-008, FR-010, FR-035)
- [ ] T023 [US2] Create `packages/db/src/repositories/placements.ts` and `packages/db/src/repositories/teaching.ts` (contracts/db-api.md §2.3–2.4; course touch on placement writes; teacher rules of data-model.md §3.5) and `packages/db/src/repositories/catalog.ts` with `maxLevelInUse` over placements (official-list entries are added in PR-14); export namespaces `placements`, `teaching`, `catalog` (FR-008–FR-010)
- [ ] T024 [US2] Add `listNamesInTenant`, `listActiveFaculty`, `lockMemberInTenant` to `packages/db/src/repositories/users.ts` (contracts/db-api.md §2.7; tenant filter on each) and extend `packages/db/test/users.int.test.ts`
- [ ] T025 [US2] Add `addPlacement`, `assignTeacher` to `packages/db/src/admin/test-support.ts` (rule 11) and create `packages/db/test/placements.int.test.ts` and `packages/db/test/teaching.int.test.ts` covering every statement listed for them in contracts/db-api.md §4 (isolation read and write for both tables)

**Accept**: `assign` → `invalid_teacher` for a student, a suspended faculty member, and a faculty member of another college · the 11th teacher → `too_many` · an inactive or other-college division in `add` → `invalid_division` with nothing inserted · placement writes bump the course's `updated_at` · `listNamesInTenant` never returns another college's user · isolation read and write cases for both tables · rls-meta passes

### PR-8 — Study plan on the course screen · branch `002-pr08-placements-screen`

- [ ] T026 [US2] Create `apps/web/src/features/course-plan/schemas.ts` (`addPlacementsSchema`, `removePlacementSchema`) with tests, add `course.placement_added` / `course.placement_removed` to `apps/web/src/server/audit.ts`, and create `apps/web/src/features/course-plan/actions.ts` with `addPlacementsAction`, `removePlacementAction` (contracts/server-actions.md §4.3; one audit row per added placement) (FR-008, FR-032)
- [ ] T027 [US2] Create `apps/web/src/features/course-plan/components/course-placements.tsx` (table: term kind, level «الفرقة الثانية», division; add form with level select 1…`levelsCount`, term-kind select, active-division checkboxes in a `fieldset`/`legend`; remove buttons) and add the study-plan section to the course page; add `level` and `division` to `coursesFilterSchema` and `courses-filters.tsx`; namespace `catalog.plan` (FR-007, FR-008)
- [ ] T028 [US2] In `apps/web/src/features/tenant-settings/actions.ts` use `max(studentProfiles.maxLevelInUse(tx), catalog.maxLevelInUse(tx))` for `levels_in_use` (contracts/server-actions.md §6) and update `actions.test.ts` (FR-009)
- [ ] T029 [US2] Create `apps/web/e2e/catalog-plan.spec.ts` (part 1): US2 scenarios 1–4 (scenario 1 also under `/en`); the level/division filters of US1 scenario 8; forged other-college `divisionIds` → `invalid_choice`, nothing added; forged `placementId` of another course → `not_found`; non-admin roles refused; audit rows; extend `apps/web/e2e/admin-settings.spec.ts` with "levels below a placed level → `levels_in_use`"

**Accept**: US2 scenarios 1–4 and the rest of US1 scenario 8 pass · one `course.placement_added` row per placement created · the division checkboxes are reachable and togglable with the keyboard

### PR-9 — Teachers on the course screen · branch `002-pr09-teachers-screen`

- [ ] T030 [US2] Add `assignTeacherSchema`, `removeTeacherSchema` (+ tests) to `apps/web/src/features/course-plan/schemas.ts`, `course.teacher_assigned` / `course.teacher_removed` to `apps/web/src/server/audit.ts`, and `assignTeacherAction`, `removeTeacherAction` to `apps/web/src/features/course-plan/actions.ts` (contracts/server-actions.md §4.3) (FR-010, FR-032)
- [ ] T031 [US2] Create `apps/web/src/features/course-plan/components/course-teachers.tsx` (GET term select `?term=` defaulting to the current term — invalid or other-college term id → current term; teachers' names from `users.listNamesInTenant`; remove buttons; add form with a labelled select fed by `users.listActiveFaculty`) and add the teachers section to the course page (FR-010)
- [ ] T032 [US2] Extend `apps/web/e2e/catalog-plan.spec.ts` (part 2): US2 scenarios 5–7; forged `userId` of a student, a suspended faculty member, and another college's faculty member → `invalid_choice`; inactive course → the conflict message; 10 teachers via `assignTeacher` then the 11th → `too_many`; non-admin roles refused; audit rows

**Accept**: US2 scenarios 5–7 pass · the select offers only active faculty members of the college (asserted against fixtures with a suspended one and another college's one) · audit rows `course.teacher_assigned {termId, userId}`, `course.teacher_removed`

---

## Phase 4: User Story 3 — A student sees their courses (Priority: P1)

**Goal**: the core module read contract, and "My courses" built on it.

**Independent Test**: quickstart.md V3.

### PR-10 — Module read contract (core reads) · branch `002-pr10-catalog-contract`

- [ ] T033 [US3] Add to `packages/db/src/repositories/catalog.ts` the eight functions of contracts/catalog-read.md §2 (`currentTerm`, `findTerm`, `findCourse`, `studentCourses`, `isStudentInCourse`, `teacherCourses`, `isTeacher`, `termOfferings` in two statements) and export the new type `StudyGroup` (the other types are already exported since PR-2/PR-4; do not export them twice). Implement nothing from catalog-read.md §5 (FR-011, FR-012, FR-033)
- [ ] T034 [US3] Create `packages/db/test/catalog-read.int.test.ts`: each function's semantics from contracts/catalog-read.md §2 (summer term, no current term, no profile, inactive course, deactivated division on an existing placement, ordering, a past term computed from the student's current profile) plus one cross-college case per function

**Accept**: every function returns `null`/`[]`/`false` (never throws) for unknown or malformed ids and for missing data (tests) · `studentCourses` for a summer term → `courses: []` · `termOfferings` issues two statements regardless of course count · no function returns a name or an email · no deferred read (§5) exists in the code

### PR-11 — My courses · branch `002-pr11-my-courses`

- [ ] T035 [US3] Create `apps/web/src/app/[locale]/(app)/courses/page.tsx` (`requirePermission('courses.view_own', '/courses')`; `catalog.studentCourses` + `users.listNamesInTenant`) and `apps/web/src/app/[locale]/(app)/courses/[courseId]/page.tsx` (`notFound()` unless `catalog.isStudentInCourse` for the current term), with `apps/web/src/features/my-courses/components/{my-courses-list,course-details,my-courses-card}.tsx` (term label; code in an LTR isolate; total credit hours; the three empty states of FR-013; description `dir="auto"` with line breaks; topics as `<ol>`); "My courses" nav entry; the dashboard card for students; namespace `courses` (FR-011–FR-013, FR-031)
- [ ] T036 [US3] Create `apps/web/e2e/my-courses.spec.ts`: US3 scenarios 1–6 with data from `createTerm`/`createCourse`/`addPlacement`/`assignTeacher` in the spec's own college (scenario 1 also under `/en`); add the `college_student` pseudo-role to `signInAs` in `screens.ts`, extend `ensureScreenFixtures` with the placement for that student (contracts/db-api.md §3), add `/courses` (static, `student` and `college_student`) and `/courses/[courseId]` (`prepare`, `college_student`) to `SIGNED_IN_SCREENS`, `/ar/courses` (student, 300 KB) to the script budget, and "My courses" to the student row of the `rbac.spec.ts` expectations

**Accept**: US3 scenarios 1–6 pass · "My courses" is reachable in one step from the home screen (nav entry and card) · a course of another level/division is reported as not found by address · the student course page is scanned through `prepare` · ar + en screenshots, desktop and mobile

**Checkpoint**: US1–US3 complete — the P1 slice is demonstrable (catalog, study plan, teachers, "My courses").

---

## Phase 5: User Story 4 — Student Affairs loads the official student list (Priority: P2)

**Goal**: upload a CSV, read the validation report and preview, apply or discard.

**Independent Test**: quickstart.md V4.

### PR-12 — Name matching and the apply plan (pure) · branch `002-pr12-roster-plan`

- [ ] T037 [US4] Create `packages/db/src/roster/types.ts` (`StagedRow`, `CurrentEntry` with `revokedUserId`, `ProfileForMatch`, `RosterPlan`, `RosterIssueCode` with the 13 codes of contracts/roster-csv.md §5, `ImportIssue`, `ImportSummary`, and Zod schemas used when reading `staged_rows`, `issues`, and `summary` back from JSONB) (FR-016, FR-017)
- [ ] T038 [P] [US4] Create `packages/db/src/roster/names.ts` (`nameTokens`, `namesMatch` with `k = min(|O|, 3)` and `|A| ≥ k`, contracts/db-api.md §1.2) with `names.test.ts` (diacritics; hamza, ta marbuta, alef maqsura variants; invisible characters and presentation forms; «عبد الله» = «عبدالله»; 3-word account vs 4-word official → true; **2-word account vs 4-word official → false**; 2-word account vs 2-word official → true; difference in the 3rd word; 1-word official → false; Latin vs Arabic → false) (FR-022)
- [ ] T039 [US4] Create `packages/db/src/roster/plan.ts` (`planRosterApply`, contracts/db-api.md §1.3, data-model.md §3.7 "Automatic links across imports") with `plan.test.ts` (insert/update/unchanged/remove; `manual` link kept while listed; `auto` link kept when only the account name changed; `auto` link re-checked and dropped when the official name changed to a non-matching one, kept when it changed only in spelling variants; `revokedUserId` never linked; removed linked entries counted in `verifiedLosing`; new `auto` link when names match; profiles without an entry untouched; deterministic output order); export the roster helpers and types from `packages/db/src/index.ts` (FR-017, FR-018, FR-022, FR-026, FR-028)

**Accept**: `plan.ts` and `names.ts` import nothing that performs I/O · line coverage of `src/roster/*` ≥ 95% · `namesMatch('محمد على رضوان', 'مُحَمَّد علي رضوان حسن')` is `true`, `namesMatch('محمد علي', 'مُحَمَّد علي رضوان حسن')` is `false`, and `namesMatch('محمد علي حسن', 'محمد علي رضوان')` is `false` (tests)

### PR-13 — Roster tables and the verified lock · branch `002-pr13-roster-tables`

- [ ] T040 [US4] Create `packages/db/src/schema/roster.ts` (`roster_imports`, `roster_entries`, data-model.md §3.6–3.7: every CHECK listed there incl. `staged_rows IS NULL OR issue_count = 0`; `name_search`, `revoked_user_id`; FKs to `divisions`, `roster_imports`, `users`), generated migration, custom SQL migration `roster_security` (`student_profiles_tenant_user_code_unique UNIQUE (tenant_id, user_id, student_code)`; `roster_entries_profile_fk FOREIGN KEY (tenant_id, user_id, student_code) REFERENCES student_profiles (tenant_id, user_id, student_code) ON UPDATE RESTRICT ON DELETE SET NULL (user_id)`; partial unique index `roster_imports_one_draft`; RLS + `tenant_isolation` on both; grants imports `SELECT, INSERT, UPDATE`, entries `SELECT, INSERT, UPDATE, DELETE`), classification entries (FR-014, FR-021, FR-024, FR-035)
- [ ] T041 [US4] Create the private roster-lock helper `packages/db/src/repositories/roster-lock.ts` (data-model.md §2; not exported from the package) and change `studentProfiles.update` in `packages/db/src/repositories/student-profiles.ts` (contracts/db-api.md §2.7: when the patch contains code, level, or division, take the roster lock **before** reading the row; then compare; `verified_locked` only for a real change on a linked profile; write only the changed columns; `roster_entries_profile_fk` added to `CONFLICTS` as `verified_locked`); add `profile_locked` to `ErrorCode` in `apps/web/src/lib/result.ts` and map `verified_locked` → `fail('profile_locked')` in `updateStudentProfileAction` (`apps/web/src/features/profile/actions.ts`) and `adminUpdateStudentProfileAction` (`apps/web/src/features/admin-users/actions.ts`) with unit tests; the translated `profile_locked` message in `errors` (FR-024)
- [ ] T042 [US4] Create `packages/db/test/roster-tables.int.test.ts` and extend `packages/db/test/student-profiles.int.test.ts` and `rls-meta.int.test.ts` exactly as contracts/db-api.md §4 (links created by owner SQL; the other-college same-code link refused by the FK)

**Accept**: a link from an entry of college A to a profile of college B with the same student code fails on `roster_entries_profile_fk` (owner-role insert, RLS bypassed) · a direct insert of staged rows with problems fails · changing a linked profile's level through `studentProfiles.update` → `verified_locked`, resubmitting its stored values → `ok`, changing its code through SQL → FK error, and through the repository → `verified_locked` (never `internal`) · a level change blocks while another connection holds the college's roster lock · **race (two connections)**: an update repeating the old level/division, run while another connection holds the roster lock and links and syncs the profile to new values, does not overwrite the synced values after both commit · isolation read and write cases for both tables · rls-meta passes · 001's `profile.spec.ts` and `admin-users.spec.ts` pass unchanged

### PR-14 — Import repository · branch `002-pr14-roster-imports`

- [ ] T043 [US4] Create `packages/db/src/repositories/roster.ts` with `createDraft`, `findImport`, `listImports`, `currentDraftId`, `discard`, `purgeExpiredDrafts` (contracts/db-api.md §2.6; purge order of data-model.md §3.6) and `RosterQueryError`; add `listStudentNames` to `packages/db/src/repositories/users.ts`; extend `catalog.maxLevelInUse` to official-list entries; export namespace `roster` (FR-017, FR-019–FR-021, FR-009)
- [ ] T044 [US4] Add `listRosterImports`, `ageRosterDraft` to `packages/db/src/admin/test-support.ts` (rule 11); create `packages/db/test/roster-imports.int.test.ts`; extend `users.int.test.ts` and `placements.int.test.ts` (`maxLevelInUse` over entries)

**Accept**: two concurrent `createDraft` calls → one draft remains, the other discarded · `createDraft` issues the same number of statements for 10 and 2,000 rows · `purgeExpiredDrafts` clears data and sets `expired` after `ageRosterDraft(25)` · `discard` of an expired draft → `expired` · `findImport` never returns staged rows

### PR-15 — CSV reading: encodings and parser · branch `002-pr15-csv`

- [ ] T045 [US4] Create `apps/web/src/lib/csv.ts` (`decodeCsvBytes` with the signature and encoding order of contracts/roster-csv.md §1 and research.md §1, returning `{ ok: true, text } | { ok: false, code: 'file_type' | 'file_encoding', hint? }`; `detectSeparator(headerLine, isRecognised)`; `parseCsv(text, separator)` per RFC 4180 returning records with spreadsheet row numbers, blank records skipped, and `file_malformed` with the opening row for an unterminated quote) (FR-014, FR-015)
- [ ] T046 [US4] Create `apps/web/src/lib/csv.test.ts`: a Windows-1256 encoder built in the test by inverting `new TextDecoder('windows-1256')` over `0x80–0xFF`; the same rows as UTF-8 with BOM, UTF-8 without BOM, and Windows-1256 give identical records; UTF-16 LE/BE BOMs → `file_encoding`; ZIP and OLE signatures and a `00` byte → `file_type` with `hint: 'workbook'` for the signatures; table of parser cases (quoted separators, doubled quotes, line breaks inside quotes and their row numbers, CRLF/LF/CR, trailing separator, final newline absent, unterminated quote)

**Accept**: Windows-1256 bytes `E3 CD E3 CF` decode to «محمد» (test) · line coverage of `lib/csv.ts` ≥ 95% · no dependency added to any `package.json`

### PR-16 — Roster file rules · branch `002-pr16-roster-rules`

- [ ] T047 [US4] Add the `file_*`, `missing_columns`, `duplicate_columns`, `too_many_rows` codes to `FieldErrorCode` in `apps/web/src/lib/result.ts`; create `apps/web/src/features/roster/schemas.ts` (`uploadRosterSchema` checking a `File`'s presence, `.csv` name, and size 1 byte–2 MB without reading it; `rosterImportIdSchema`; `applyRosterSchema` with optional `confirmedRemoval`; `rosterOverviewFilterSchema` for `q`, `status`, `page`) with tests (FR-014, FR-015, FR-018)
- [ ] T048 [US4] Create `apps/web/src/features/roster/rules.ts` (every cell through `stripInvisible` + NFKC first; `mapRosterHeader` with the aliases of contracts/roster-csv.md §2 → `missing_columns`, `duplicate_columns` with `meta.columns` as a comma-joined key list (contracts/server-actions.md §1), ignored header names ≤ 20 × 64 chars; `parseLevel` (digits and normalised level words, optional «الفرقة»); `matchDivision` (code, Arabic name, English name; `division_ambiguous`); `validateRosterRecords(records, header, { divisions, levelsCount })` → `{ rows, issues (first 500, ordered), issueCount, rowCount, ignoredColumns }` with every rule of §3–4 incl. student codes kept in their letter case, `code_scientific`, `code_duplicate` with `otherRow`, and `value` truncated to 40 chars only for the codes listed in §4) (FR-016, FR-017, FR-021)
- [ ] T049 [US4] Create `apps/web/src/features/roster/rules.test.ts`: one fixture with exactly one problem of each of the 13 codes and five valid rows → exactly those 13 issues with the right row and column and 5 rows (SC-003); header aliases in Arabic/English, any order, with `_` and extra spaces; an extra «الرقم القومي» column → in `ignoredColumns` and its values absent from every output; Arabic-Indic digits in codes and levels; RLM/LRM/ZWNJ around a code and a name and a presentation-form name → valid rows with clean values; `ab-123` and `AB-123` → two different codes (no `code_duplicate`); `meta.columns` for two missing columns is `'level,division'`; 600 bad rows → 500 listed, `issueCount` 600; the 10,001st record handled by the caller (`too_many_rows` unit test in `schemas`/action helper)

**Accept**: SC-003 holds at unit level · values of ignored columns never appear in `rows`, `issues`, or the summary (asserted by searching the serialised output) · names are never placed in `value` · no invisible character survives in any stored value (test)

### PR-17 — Upload and validation report · branch `002-pr17-roster-upload` · Size note expected

- [ ] T050 [US4] Set the Server Action body limit to `3mb` in `apps/web/next.config.ts` (research.md §15; verify the option name on the pinned Next.js and record any difference as a Spec deviation; the PR lists it as a change to 001 behaviour); add the `roster-upload` policy (per acting user, 30 / 3600 s) to `apps/web/src/server/rate-limit.ts` (+ policy test); add the `roster_import` target type and `roster.import_uploaded {rows, issues}`, `roster.import_discarded` to `apps/web/src/server/audit.ts` (FR-014, FR-032)
- [ ] T051 [US4] Create `apps/web/src/features/roster/actions.ts` with `uploadRosterAction` (steps 1–9 of contracts/server-actions.md §5.1) and `discardRosterImportAction` (§5.2, incl. `expired`) (FR-014–FR-017, FR-019, FR-021)
- [ ] T052 [US4] Create `apps/web/src/app/[locale]/(app)/roster/page.tsx` (`requirePermission('roster.manage', '/roster')`; purge expired drafts; upload section; link to the current draft; last 10 imports) and `roster/imports/[importId]/page.tsx` (purge expired drafts too, before reading the import; summary, ignored columns, preview counts, problems table with caption and row headers, "and N more", Discard), components `apps/web/src/features/roster/components/{upload-form,import-report,issues-table,import-history}.tsx` (upload form: labelled file input `accept=".csv"` with a described size/format hint and a browser-side size check before submit; `meta.columns` split and translated); `apps/web/public/templates/roster-template.csv` (contracts/roster-csv.md §6); the "Official student list" nav entry and shortcut; namespace `roster` incl. `roster.issues.<code>` and `roster.columns.<key>` (FR-014–FR-017, FR-020)
- [ ] T053 [US4] Create `apps/web/e2e/support/roster-files.ts` (contracts/roster-csv.md §7) and `apps/web/e2e/roster-import.spec.ts` (part 1): US4 scenarios 1–4 (scenario 1 with UTF-8 BOM, UTF-8 without BOM, and Windows-1256 → same preview; scenario 1 also under `/en`); a new upload replaces the draft and `listRosterImports` shows `hasStagedData: false` for the old one; discard; `ageRosterDraft(25)` → after opening `/ar/roster` the draft is `expired` with no staged data; non-admin roles → 404 / `forbidden`; audit rows; extend `ensureScreenFixtures` with the applied synthetic import (contracts/db-api.md §3), add `/roster` (static, `student_affairs`, `admin`) and `/roster/imports/[importId]` (`prepare`, `student_affairs`) to `SIGNED_IN_SCREENS`, and `/ar/roster` (admin, 300 KB) to the script budget

**Accept**: US4 scenarios 1–4 pass · no fixture name or code appears in the e2e server's log output (state how verified) · the national-ID test column never reaches the database (`summary`, `staged_rows`, `issues` inspected) · the 3 MB body limit is named in the PR as a change to 001 behaviour

### PR-18 — Apply an import · branch `002-pr18-roster-apply` · Size note expected

- [ ] T054 [US4] Add `applyImport` to `packages/db/src/repositories/roster.ts` (data-model.md §3.7 "Apply": order of checks, levels re-check, large-removal rule, one `unnest()` statement per set, profile sync, result counts; one transaction) and `getRosterState` to test support (rule 11); create `packages/db/test/roster-apply.int.test.ts` covering every statement listed for it in contracts/db-api.md §4 (statement count via a query counter on the test connection) (FR-018, FR-022, FR-023, FR-028)
- [ ] T055 [US4] Add `roster.import_applied {added, changed, removed, linked, unlinked, synced}` to `apps/web/src/server/audit.ts` and `applyRosterImportAction` to `apps/web/src/features/roster/actions.ts` (contracts/server-actions.md §5.2); add the Apply button with a confirmation `dialog` (repeating the removed and verification-losing counts), the large-removal confirmation form ("N of M students will be removed", submits `confirmedRemoval`), and the `levels_changed` / `expired` explanations to `import-report.tsx`, the result counts and `?applied=1` banner to the report, and counts to `import-history.tsx` (FR-017, FR-018, FR-020)
- [ ] T056 [US4] Extend `apps/web/e2e/roster-import.spec.ts` (part 2): US4 scenarios 5–8 (two pages pressing Apply on the same import → one applied, the other shows the conflict); a draft with problems has no Apply button and a forged apply → `conflict`; an expired draft cannot be applied (`expired`, also after the roster screen purged it); a file removing 2 of 3 entries → the second confirmation, then applied; a forged wrong `confirmedRemoval` → `large_removal` again; levels reduced after upload → `levels_changed`; `getRosterState` equals the file; audit row with counts

**Accept**: US4 scenarios 5–8 pass · the apply of 10 and of 2,000 rows issues **exactly the same number of statements** (integration test) · the large-removal confirmation works without JavaScript · SC-002: upload + report and apply of a 5,000-row file measured against the local production build, times stated in the PR

---

## Phase 6: User Story 5 — Students are verified and verified data is locked (Priority: P2)

**Goal**: statuses, manual confirmation and revocation, automatic verification at profile changes, and the
student's view. (The lock itself landed in PR-13.)

**Independent Test**: quickstart.md V5.

### PR-19 — Verification overview, manual confirmation, revocation · branch `002-pr19-verification-overview` · Size note expected

- [ ] T057 [US5] Add `overview` (name search on `name_search` after `normalizeArabicText`; `revoked` flag), `confirmMatch`, `revokeVerification` to `packages/db/src/repositories/roster.ts` (contracts/db-api.md §2.6) and `seedRoster` to test support (rule 11); create `packages/db/test/roster-verification.int.test.ts` (part 1: the statements for these three functions) (FR-025, FR-026)
- [ ] T058 [US5] Add `profile.verified {method}` and `profile.verification_revoked {method}` to `apps/web/src/server/audit.ts` and `confirmVerificationAction`, `revokeVerificationAction` to `apps/web/src/features/roster/actions.ts` (contracts/server-actions.md §5.2) (FR-026, FR-032)
- [ ] T059 [US5] Create `apps/web/src/features/roster/components/{verification-filters,verification-table,confirm-match-dialog,revoke-dialog}.tsx` and add the overview to `/roster` (GET filters `q`, `status`; table with student code, official name `dir="auto"`, official and registered level/division, status badge with text and method, "verification revoked" note; confirm and revoke `dialog`s showing the account name — via `users.listNamesInTenant` — beside the official name; revoke offered for every verified row, its dialog stating the next step of routes.md §2; the "verification revoked" note follows the overview's `revoked` flag) (FR-025, FR-026)
- [ ] T060 [US5] Create `apps/web/e2e/roster-verification.spec.ts` (part 1): US5 scenarios 1, 5, 8 (scenario 8 also under `/en`, including a name search with a spelling variant); revocation of an automatic link → unverified and editable, "verification revoked" shown; forged `userId` of another college → `not_found`; confirm on a verified or not-in-list student → `conflict`; revoke on an unverified one → `conflict`; non-admin roles refused; audit rows; add the overview entry of contracts/routes.md §1.1 to `SIGNED_IN_SCREENS`

**Accept**: US5 scenarios 1, 5, 8 pass · statuses are shown as text · the confirm and revoke dialogs show both names and close on Escape with focus returned · audit rows `profile.verified {method: 'manual'}`, `profile.verification_revoked {method}` · after revocation the next apply of the same list does not re-link the account (integration test)

### PR-20 — Automatic verification on profile changes · branch `002-pr20-verification-auto`

- [ ] T061 [US5] Add `verifyProfile` to `packages/db/src/repositories/roster.ts` (contracts/db-api.md §2.6; never links `revoked_user_id`) and extend `packages/db/test/roster-verification.int.test.ts` (part 2) (FR-022, FR-023)
- [ ] T062 [US5] Add the `profile-verify` policy (per student, 5 / 86400 s) to `apps/web/src/server/rate-limit.ts` (+ policy test) and apply the PR-20 rows of contracts/server-actions.md §6 to `completeStudentProfileAction`, `updateAccountAction` (`apps/web/src/features/profile/actions.ts`) and `adminUpdateStudentProfileAction` (`apps/web/src/features/admin-users/actions.ts`), with unit tests (sixth rename in a day saved without verification; a verified student's rename never calls `verifyProfile`) (FR-022, FR-028)
- [ ] T063 [US5] Extend `apps/web/e2e/roster-verification.spec.ts` (part 2): US5 scenarios 2, 4, 6, 9, 10 (scenario 2: a student completing the profile with a different level/division ends verified with the official values — checked through `getRosterState` (`linkedEmail`, `method: 'auto'`) and the overview row, because the home-screen badge arrives in PR-21 (T067); scenario 4 through the existing People dialog → `profile_locked` message, nothing changed; scenario 10: an impostor with the owner's first three names is verified, revoked, renamed without re-verification, and has the code corrected by the administrator); a verified student's profile form submission with a changed level → `profile_locked` message; `apps/web/e2e/profile.spec.ts` and `apps/web/e2e/admin-users.spec.ts` still pass unchanged

**Accept**: US5 scenarios 2 (verification part), 4, 6, 9, 10 pass · a rename that fails to re-verify never fails the rename (unit test) · audit `profile.verified {method: 'auto'}` written with the student (or the administrator) as actor · no 001 e2e spec needed changing (state it, or list each change with its reason)

### PR-21 — Verified status on the profile and home screens; privacy notice · branch `002-pr21-verification-ui`

- [ ] T064 [US5] Add `roster.verificationOf` (contracts/catalog-read.md §3) to `packages/db/src/repositories/roster.ts` and its cases (every status, revoked → `name_mismatch`, cross-college) to `packages/db/test/catalog-read.int.test.ts` (FR-027, FR-033)
- [ ] T065 [US5] Add a verification panel to the student part of `apps/web/src/app/[locale]/(app)/profile/page.tsx` (`roster.verificationOf`; verified → official code, name `dir="auto"`, level, division; otherwise one neutral "not verified yet" text with the same three-names advice for everyone) and render level and division read-only with the reason in `apps/web/src/features/profile/components/student-profile-form.tsx` when verified; add a verified badge to `apps/web/src/features/dashboard/components/student-summary.tsx` (+ its test); namespaces `profile`, `dashboard`, `common.verification` (FR-027)
- [ ] T066 [US5] Add the official-list paragraph (FR-029) to the `privacy` namespace in both catalogs and flag the wording for the owner's review in the PR (001 spec D17)
- [ ] T067 [US5] Move the 320 px no-horizontal-scroll assertion of `apps/web/e2e/responsive.spec.ts` into `apps/web/e2e/support/responsive.ts` (behaviour unchanged) and extend `apps/web/e2e/roster-verification.spec.ts` (part 3): US5 scenarios 3 and 7, and the home-screen part of scenario 2 (after completing the profile, the dashboard's student summary shows the verified badge with text); scenario 7: for a name-mismatch student and a not-in-list student the profile page contains neither the official name nor any text that differs between the two cases — compare the rendered panels; scenario 3 also under `/en`; `expectNoA11yViolations` and the 320 px assertion on the profile screen in the verified and unverified states in both locales (routes.md §1.1); `apps/web/e2e/privacy.spec.ts` still passes

**Accept**: US5 scenarios 3 and 7 and the home-screen part of scenario 2 pass · the verified badge has text · the privacy paragraph exists in both languages and is flagged for the owner · ar + en screenshots of both profile states

**Checkpoint**: all five user stories are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

### PR-22 — Demo data, traceability, final sweep · branch `002-pr22-final-sweep`

- [ ] T068 Extend `seedDemo` in `packages/db/src/admin/seed.ts` with the demo terms and courses of data-model.md §6 (idempotent; no teachers, no official list) and extend `packages/db/test/admin.int.test.ts`
- [ ] T069 [P] Create `specs/002-academic-catalog/traceability.md` (FR → batches → tests, the format of 001's) and add one line to `CLAUDE.md` "Product rules": modules read the catalog and roster only through `specs/002-academic-catalog/contracts/catalog-read.md`, and a missing read is added there under its extension rule
- [ ] T070 Final sweep: axe on every screen of contracts/routes.md §2 in `ar` and `en`; script budgets; quickstart V1–V5 by hand (record SC-001's timing); confirm no `TODO` without a task ID and no `log.*` call with personal data in the feature's files

**Accept**: axe zero serious/critical on every new screen in both languages · budgets pass with the measured values printed · quickstart V1–V5 completed (PR states it) · every FR of spec.md is ticked in `traceability.md` against a merged batch and a test or a documented manual check

---

## Dependencies & Execution Order

### Batch order

Strictly sequential: `PR-1 → PR-2 → … → PR-22`. 002 PR-1 starts after this documentation PR is merged by the
owner with the questions answered, from `main` after feature 001 is complete; 001's open PR-40 (first-load
script reduction, awaiting the owner's own test) touches none of these files and does not block 002.

### Phase dependencies

- **Foundational (PR-1)**: blocks everything.
- **US1 (PR-2…PR-6)**: needs PR-1. Internal: terms (2→3), courses (4→5→6).
- **US2 (PR-7…PR-9)**: needs PR-2 (terms) and PR-4 (courses); PR-9 needs PR-7.
- **US3 (PR-10, PR-11)**: needs US1 and US2 data layers (PR-2, PR-4, PR-7).
- **US4 (PR-12…PR-18)**: PR-12, PR-15, PR-16 are pure; PR-13 needs 001's profiles; PR-14 needs PR-12,
  PR-13, and PR-7 (`catalog.ts`); PR-17 needs PR-14–PR-16; PR-18 needs PR-17.
- **US5 (PR-19…PR-21)**: needs PR-18 (verification statuses exist only after an apply).
- **Polish (PR-22)**: after all stories.

### Within a batch

Schemas/rules and their unit tests → repositories and integration tests → actions → pages/components →
e2e. Tasks marked [P] touch different files and may be done in any order within the batch.

### Parallel opportunities

The delivery workflow is one batch at a time. If the owner later runs two implementers, these do not touch
the same files and could proceed in parallel after their prerequisites: PR-12, PR-15, PR-16 (pure roster
code) alongside PR-5…PR-11; PR-10 alongside PR-8/PR-9. Message catalogs, `audit.ts`, `screens.ts`,
`test-support.ts`, and `rbac.spec.ts` are shared files — parallel batches must rebase.

## Parallel Example: PR-12

```text
T038 — names.ts and its tests depend only on PR-1's text.ts.
T039 — plan.ts uses namesMatch; write it after T038 (same batch, sequential).
```

## Implementation Strategy

### MVP first

1. PR-1 — permissions and helpers.
2. PR-2…PR-6 — **US1**: terms and the course catalog (validate with quickstart V1).
3. PR-7…PR-9 — **US2**: study plan and teachers (V2).
4. PR-10, PR-11 — **US3**: core module reads and "My courses" (V3). The P1 slice is complete; Kitabi and
   CodeJudge can be specified against `contracts/catalog-read.md` from here.

### Incremental delivery

5. PR-12…PR-18 — US4 official list import, with the lock in place before the first link (V4).
6. PR-19…PR-21 — US5 verification, revocation, and the student's view (V5).
7. PR-22 — demo data, traceability, sweep.

After each checkpoint the system is releasable for the stories completed so far.

## Requirement coverage

| Requirement | Batches |
|---|---|
| FR-001–FR-003 | PR-2, PR-3 |
| FR-004, FR-005 | PR-4, PR-5 |
| FR-006 | PR-4, PR-6 |
| FR-007 | PR-4, PR-5, PR-8 |
| FR-008 | PR-7, PR-8 |
| FR-009 | PR-7, PR-8, PR-14 |
| FR-010 | PR-7, PR-9 |
| FR-011–FR-013 | PR-10, PR-11 |
| FR-014, FR-015 | PR-13, PR-15, PR-16, PR-17 |
| FR-016, FR-017 | PR-12, PR-16, PR-17, PR-18 |
| FR-018 | PR-12, PR-16, PR-18 |
| FR-019, FR-020 | PR-14, PR-17, PR-18 |
| FR-021 | PR-13, PR-14, PR-16, PR-17 |
| FR-022 | PR-12, PR-18, PR-20 |
| FR-023 | PR-18, PR-20 |
| FR-024 | PR-13 (FK, repository lock, action mapping), PR-20 (e2e) |
| FR-025, FR-026 | PR-12 (revoked never re-linked), PR-19, PR-20 (scenario 10) |
| FR-027 | PR-21 |
| FR-028 | PR-12, PR-18, PR-20 |
| FR-029 | PR-21 |
| FR-030 | PR-1, and every screen batch's RBAC cases |
| FR-031 | PR-3, PR-5, PR-11, PR-17 |
| FR-032 | PR-3, PR-5, PR-6, PR-8, PR-9, PR-17, PR-18, PR-19, PR-20 |
| FR-033 | PR-10, PR-21 |
| FR-034 | every screen batch, PR-22 |
| FR-035 | PR-2, PR-4, PR-7, PR-13 (isolation read/write tests), PR-10, PR-21 (contract cross-college cases) |
| SC-002 | PR-18 (measured), PR-22 |
| SC-003 | PR-16 (unit), PR-17 (e2e) |
| SC-004 | PR-2, PR-4, PR-7, PR-10, PR-13, PR-21 |
| SC-005 | PR-10, PR-11 |
| SC-006 | PR-1 (matrix), PR-3, PR-5, PR-11, PR-17 (RBAC e2e) |
| SC-007 | every screen batch, PR-22 |

SC-001 is measured by hand in PR-22; SC-008 is measured by the owner after the first real import.

## Notes

- A task that names a contract section must implement that section completely — the contract is the
  detailed specification; this file only orders the work.
- Library option names in research.md are indicative; observable behaviour in contracts is binding
  (plan.md "Implementation latitude"). Report differences under **Spec deviation**.
- If a batch cannot meet an Accept line, do not weaken the test: stop and report.
