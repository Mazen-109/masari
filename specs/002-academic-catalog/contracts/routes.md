# Contract: Routes and Screens (additions)

**Feature**: `002-academic-catalog` · Extends `specs/001-platform-foundation/contracts/routes.md`; its global
rules (§1), shell (§4), special files (§5), and accessibility contract (§7) apply to every screen below.
Paths omit the locale prefix.

## 1. Global rules for the new screens

- Every `page.tsx` calls `requirePermission(<permission>, <path>)` itself (guard-coverage test).
- A path parameter that is not a uuid, or an id of another college, → `notFound()` (no database error page).
- Lists are paginated 20 per page with "page x of y" and previous/next links that keep the filters; a page
  past the last redirects to the last page (001 people-list rule); filters are GET forms that work without
  JavaScript.
- Course codes, student codes, academic years, and dates are rendered in an LTR isolate (`<bdi dir="ltr">`
  or `dir="ltr"` on the cell); descriptions, topics, and official names use `dir="auto"`.
- `/catalog/courses`, `/roster`, and `/courses` are added to the 300 KB script budget in
  `perf-budget.spec.ts`.

### 1.1 Screen lists (`apps/web/e2e/support/screens.ts`)

Every new screen is added to `SIGNED_IN_SCREENS` (axe, CSP, 320 px, and 200% zoom checks) for the roles
listed below. Static paths are added as today. Screens whose path contains an id use a **`prepare` hook**,
introduced by PR-5 (the first such screen):

- An entry may carry `prepare?: (page: Page) => Promise<string>`. `path` then stays a readable label (e.g.
  `/catalog/courses/[courseId]`, used in test titles), and the three consumers (`a11y.spec.ts`,
  `security-headers.spec.ts`, `responsive.spec.ts`) visit `await screenPath(page, screen)` — a helper
  exported from `screens.ts` that returns `path` or, after sign-in, the result of `prepare(page)`. That is
  the only change to those specs.
- `prepare` creates data **only in the role-based access college** (`ensureRoleCollege(page)` from
  `support/roles.ts`), never in the demo college (tasks.md rule 7), through the idempotent test-support
  helper `ensureScreenFixtures` (contracts/db-api.md §3, wrapped in `support/db.ts`). It is safe when many
  workers call it at once. 002's own specs use their own colleges, so these fixtures change no assertion.
- Dynamic screens are therefore listed for roles of the role-based access college: `student_affairs` for
  catalog and roster screens, and a new pseudo-role **`college_student`** (that college's student, signed in
  with `signInAsRole(page, 'student')`) for the student course page. The demo `admin` is listed for the
  static screens only; the components are the same.

| Entry | Roles | Data | Batch |
|---|---|---|---|
| `/catalog/terms` | `student_affairs`, `admin` | static | PR-3 |
| `/catalog/courses`, `/catalog/courses/new` | `student_affairs`, `admin` | static | PR-5 |
| `/catalog/courses/[courseId]` | `student_affairs` | `prepare` → course `A11Y 101` | PR-5 (the sections added by PR-6, PR-8, PR-9 are scanned through the same entry) |
| `/courses` | `student`, `college_student` | static | PR-11 |
| `/courses/[courseId]` | `college_student` | `prepare` → `A11Y 101`, placed for that student | PR-11 |
| `/roster` | `student_affairs`, `admin` | static | PR-17 |
| `/roster/imports/[importId]` | `student_affairs` | `prepare` → an applied import of synthetic entries | PR-17 |
| `/roster?q=nobody-matches&status=verified` (overview, every filter, no match) | `student_affairs`, `admin` | static | PR-19 |

The verified state of `/profile` is not a screen-list entry (making the role student verified would change
other specs): `roster-verification.spec.ts` checks it in its own college with `expectNoA11yViolations`
(`support/axe.ts`) and the 320 px no-horizontal-scroll assertion of `responsive.spec.ts`, which PR-21 moves
into `support/responsive.ts` so both specs share it.

## 2. Signed-in screens — route group `(app)`

| Path | File (`src/app/[locale]/(app)/…`) | Guard | Content | Batch |
|---|---|---|---|---|
| `/catalog/terms` | `catalog/terms/page.tsx` | `requirePermission('catalog.manage', '/catalog/terms')` | Add-term form (year as `2026` with the `2026/2027` label shown, kind select, two date inputs); table (term label, dates, current badge with text, edit dialog, "make current" button) | PR-3 |
| `/catalog/courses` | `catalog/courses/page.tsx` | `catalog.manage` | GET filters `q`, `level`, `division`, `status`; table (code, name in the current language, credit hours, number of placements, status); "Add course" link | PR-5 (level/division filters: PR-8) |
| `/catalog/courses/new` | `catalog/courses/new/page.tsx` | `catalog.manage` | Course form (code `dir="ltr"`, Arabic name `dir="rtl"`, English name `dir="ltr"`, credit hours, description textarea `dir="auto"`) | PR-5 |
| `/catalog/courses/[courseId]` | `catalog/courses/[courseId]/page.tsx` | `catalog.manage` | Sections, each with an `h2`: details (edit form + activate/deactivate), topics (ordered list with rename dialog, move up/down, remove, add form), study plan (placements table + add form: level select 1…`levelsCount`, term-kind select, division checkboxes in a `fieldset`), teachers (term select via `?term=<id>`, current term by default; teachers list with remove; add form with a select of active faculty members) | PR-5 (details), PR-6 (topics), PR-8 (study plan), PR-9 (teachers) |
| `/roster` | `roster/page.tsx` | `requirePermission('roster.manage', '/roster')` | Upload form (file input `accept=".csv"`, template link, instructions) + link to the current draft if any; verification overview (GET filters `q`, `status`; table: student code, official name, official level/division, registered level/division, status badge with text and method, a "verification revoked" note, row actions confirm / revoke, each in a dialog showing the account name beside the official name); last 10 imports (date, by whom, rows, counts, status) | PR-17 (upload, history), PR-19 (overview) |
| `/roster/imports/[importId]` | `roster/imports/[importId]/page.tsx` | `roster.manage` | Status and summary (rows, problems, ignored columns); preview counts or result counts; problems table (row, column, problem text, value) with "and N more"; Apply (confirmation dialog repeating the removed / verification-losing counts) and Discard buttons while it is an applicable draft; after a `large_removal` answer, a second confirmation form that states "N of M students will be removed" and submits `confirmedRemoval = N` (works without JavaScript); the `levels_changed` and `expired` explanations; `?applied=1` → success banner | PR-17 (report, discard), PR-18 (apply) |
| `/courses` | `courses/page.tsx` | `requirePermission('courses.view_own', '/courses')` | Current term label; list of the student's courses (code, name, credit hours, teachers' names) as links; total credit hours; empty states: no current term / summer term / nothing placed | PR-11 |
| `/courses/[courseId]` | `courses/[courseId]/page.tsx` | `courses.view_own`; then `notFound()` unless `catalog.isStudentInCourse(…, currentTerm)` | Name (`h1`), code, credit hours, teachers, description, ordered topics (`<ol>`) | PR-11 |

Changed 001 screens:

| Path | Change | Batch |
|---|---|---|
| `/dashboard` | Students: "My courses" card; verified badge in the student summary. Catalog managers: academic-affairs shortcut cards. | PR-11, PR-3/PR-5/PR-17 (shortcuts), PR-21 (badge) |
| `/profile` | Students: verification panel (verified → official code, name, level, division; else one neutral "not verified yet" text with the same advice for everyone: write the account name as in the college's records, with at least the first three names); level and division read-only when verified, with the reason | PR-21 |
| `/admin/users` | No visual change: a correction of a verified student's academic data is refused with the translated `profile_locked` message in the dialog's error summary | PR-13 |
| `/privacy` | Adds the official-list paragraph (FR-029) | PR-21 |

## 3. Static file

`apps/web/public/templates/roster-template.csv` (contracts/roster-csv.md §6) — served as a static asset with
the standard security headers; contains no data.

## 4. Message namespaces (`apps/web/messages/{ar,en}.json`)

New: `catalog.terms`, `catalog.courses`, `catalog.topics`, `catalog.plan` (placements and teachers),
`roster` (upload, report, `roster.issues.<code>`, `roster.columns.<key>`, overview, statuses, revocation,
large-removal confirmation, history), `courses` (student screens).
Extended: `nav` (`myCourses`, `academicSection`, `terms`, `courses`, `roster`), `dashboard`, `profile`,
`admin.users`, `privacy`, `errors` (every new `ErrorCode`/`FieldErrorCode` and `conflict` reason), `meta`
(titles of the eight screens), `common` (`termKinds.first|second|summer` «الفصل الدراسي الأول» / «الفصل
الدراسي الثاني» / «الفصل الصيفي»; `verification.verified|name_mismatch|not_in_roster|not_registered|revoked`).

Fixed Arabic terms: المقرر / المقررات، مقرراتي، كود المقرر، الساعات المعتمدة، موضوعات المقرر، توزيع المقرر،
القائم بالتدريس، الفصل الدراسي، العام الجامعي، الفصل الدراسي الحالي، الشئون الأكاديمية، قائمة الطلاب الرسمية،
تم التحقق، لم يتم التحقق بعد، الاسم غير مطابق، غير موجود في القائمة، لم يسجل بعد، إلغاء التحقق.

## 5. Accessibility specifics

- The file input has a visible label and a description (accepted format, size, template link) referenced by
  `aria-describedby`; whole-file errors are announced through the form's `role="alert"` summary.
- The problems table and every list table have a `<caption>`; row numbers are in the first column as
  `<th scope="row">`.
- Move-up/move-down buttons have accessible names that include the topic title ("Move «…» up"); after a
  move, focus returns to the moved topic's same button (or the other one at an edge).
- Status badges always include text (never colour alone).
- The apply, confirm, and revoke confirmations are dialogs (focus trap, Escape, focus return) and state the
  consequences in text; the large-removal confirmation is a plain form on the report page.
