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
- Every new screen is appended to `apps/web/e2e/support/screens.ts` (axe, CSP, 320 px and 200% zoom checks)
  for each role that can open it; `/catalog/courses`, `/roster`, and `/courses` are added to the 300 KB
  script budget in `perf-budget.spec.ts`.

## 2. Signed-in screens — route group `(app)`

| Path | File (`src/app/[locale]/(app)/…`) | Guard | Content | Batch |
|---|---|---|---|---|
| `/catalog/terms` | `catalog/terms/page.tsx` | `requirePermission('catalog.manage', '/catalog/terms')` | Add-term form (year as `2026` with the `2026/2027` label shown, kind select, two date inputs); table (term label, dates, current badge with text, edit dialog, "make current" button) | PR-3 |
| `/catalog/courses` | `catalog/courses/page.tsx` | `catalog.manage` | GET filters `q`, `level`, `division`, `status`; table (code, name in the current language, credit hours, number of placements, status); "Add course" link | PR-5 (level/division filters: PR-8) |
| `/catalog/courses/new` | `catalog/courses/new/page.tsx` | `catalog.manage` | Course form (code `dir="ltr"`, Arabic name `dir="rtl"`, English name `dir="ltr"`, credit hours, description textarea `dir="auto"`) | PR-5 |
| `/catalog/courses/[courseId]` | `catalog/courses/[courseId]/page.tsx` | `catalog.manage` | Sections, each with an `h2`: details (edit form + activate/deactivate), topics (ordered list with rename dialog, move up/down, remove, add form), study plan (placements table + add form: level select 1…`levelsCount`, term-kind select, division checkboxes in a `fieldset`), teachers (term select via `?term=<id>`, current term by default; teachers list with remove; add form with a select of active faculty members) | PR-5 (details), PR-6 (topics), PR-8 (study plan), PR-9 (teachers) |
| `/roster` | `roster/page.tsx` | `requirePermission('roster.manage', '/roster')` | Upload form (file input `accept=".csv"`, template link, instructions) + link to the current draft if any; verification overview (GET filters `q`, `status`; table: student code, official name, official level/division, registered level/division, status badge with text and method, row actions confirm/undo); last 10 imports (date, by whom, rows, counts, status) | PR-16 (upload, history), PR-18 (overview) |
| `/roster/imports/[importId]` | `roster/imports/[importId]/page.tsx` | `roster.manage` | Status and summary (rows, problems, ignored columns); preview counts or result counts; problems table (row, column, problem text, value) with "and N more"; Apply (confirmation dialog repeating the removed / verification-losing counts) and Discard buttons while it is an applicable draft; `?applied=1` → success banner | PR-16 (report, discard), PR-17 (apply) |
| `/courses` | `courses/page.tsx` | `requirePermission('courses.view_own', '/courses')` | Current term label; list of the student's courses (code, name, credit hours, teachers' names) as links; total credit hours; empty states: no current term / summer term / nothing placed | PR-11 |
| `/courses/[courseId]` | `courses/[courseId]/page.tsx` | `courses.view_own`; then `notFound()` unless `catalog.isStudentInCourse(…, currentTerm)` | Name (`h1`), code, credit hours, teachers, description, ordered topics (`<ol>`) | PR-11 |

Changed 001 screens:

| Path | Change | Batch |
|---|---|---|
| `/dashboard` | Students: "My courses" card; verified badge in the student summary. Catalog managers: academic-affairs shortcut cards. | PR-11, PR-3/PR-5/PR-16 (shortcuts), PR-20 (badge) |
| `/profile` | Students: verification panel (verified → official code, name, level, division; else "not verified yet" text); level and division read-only when verified, with the reason | PR-20 |
| `/admin/users` | No visual change: a correction of a verified student's academic data is refused with the translated `profile_locked` message in the dialog's error summary | PR-19 |
| `/privacy` | Adds the official-list paragraph (FR-029) | PR-20 |

## 3. Static file

`apps/web/public/templates/roster-template.csv` (contracts/roster-csv.md §6) — served as a static asset with
the standard security headers; contains no data.

## 4. Message namespaces (`apps/web/messages/{ar,en}.json`)

New: `catalog.terms`, `catalog.courses`, `catalog.topics`, `catalog.plan` (placements and teachers),
`roster` (upload, report, `roster.issues.<code>`, overview, statuses, history), `courses` (student screens).
Extended: `nav` (`myCourses`, `academicSection`, `terms`, `courses`, `roster`), `dashboard`, `profile`,
`admin.users`, `privacy`, `errors` (every new `ErrorCode`/`FieldErrorCode`), `meta` (titles of the eight
screens), `common` (`termKinds.first|second|summer` «الفصل الدراسي الأول» / «الفصل الدراسي الثاني» /
«الفصل الصيفي»; `verification.verified|name_mismatch|not_in_roster|not_registered`).

Fixed Arabic terms: المقرر / المقررات، مقرراتي، كود المقرر، الساعات المعتمدة، موضوعات المقرر، توزيع المقرر،
القائم بالتدريس، الفصل الدراسي، العام الجامعي، الفصل الدراسي الحالي، الشئون الأكاديمية، قائمة الطلاب الرسمية،
تم التحقق، لم يتم التحقق بعد، الاسم غير مطابق، غير موجود في القائمة، لم يسجل بعد.

## 5. Accessibility specifics

- The file input has a visible label and a description (accepted format, size, template link) referenced by
  `aria-describedby`; whole-file errors are announced through the form's `role="alert"` summary.
- The problems table and every list table have a `<caption>`; row numbers are in the first column as
  `<th scope="row">`.
- Move-up/move-down buttons have accessible names that include the topic title ("Move «…» up"); after a
  move, focus returns to the moved topic's same button (or the other one at an edge).
- Status badges always include text (never colour alone).
- The apply confirmation is a dialog (focus trap, Escape, focus return), and states the consequences in
  text.
