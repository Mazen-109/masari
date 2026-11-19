# Implementation Plan: Academic Catalog & Student Roster

**Branch**: `002-academic-catalog` (one branch + PR per batch: `002-prNN-slug`) | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-academic-catalog/spec.md`

**Note**: Produced by following `.claude/skills/speckit-plan/SKILL.md` by hand (the Spec Kit helper scripts
were not run; `.specify/feature.json` points at this folder). Phase 0 output: [research.md](./research.md).
Phase 1 outputs: [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).
Phase 2 output: [tasks.md](./tasks.md).

## Summary

Add the shared academic data every module reads: terms (one current per college), a course catalog with
bilingual names, description, and ordered topics, study-plan placements (course × level × division × first
or second term), per-term teacher assignments, a student's "My courses", and the official student list
(roster) imported from CSV with a validation report, a preview, and replace-on-apply. Registered students
are verified against the list automatically (code + normalised name) or by hand, and a verified student's
code, level, and division are then locked and follow the official list.

Technical approach (details in research.md): seven new tenant-scoped tables under forced RLS, built exactly
like 001's (custom security migrations, classification entries, cross-college tests); all writes through
`@masari/db` repositories in `withTenant`; Server Actions with the 001 shape; the upload is a Server Action
that decodes UTF-8 or Windows-1256 bytes in memory with the platform `TextDecoder`, parses CSV with an
in-house RFC 4180 parser, validates rows with pure rules, and stores only an error-free draft's four
columns; apply is one bounded transaction with a fixed number of statements (`unnest()` array
parameters), driven by a pure planning function shared with the preview; verification is a link on the
official entry, with the lock enforced in the repository (under the college's roster lock) and by a
composite foreign key that includes the college; a catalog manager can revoke a wrong verification; modules
read the core data through a documented, tested `catalog`/`roster` read API whose later reads are added by
their consumers.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) on Node.js 24 LTS (minimum 22) —
unchanged from 001

**Primary Dependencies**: unchanged (Next.js 16.4, React 19, next-intl 4, Drizzle ORM 0.45 + drizzle-kit,
`pg`, Zod 4, Tailwind 4 + shadcn/ui). **No new runtime dependency** (CSV parsing and Windows-1256 decoding
use in-house code and the platform `TextDecoder`, research.md §1, §4).

**Storage**: PostgreSQL 16+ (≥ 15 required for `ON DELETE SET NULL (column)`; CI and Neon run 16+). Seven
new tenant-scoped tables; one constraint added to `student_profiles`.

**Testing**: Vitest (unit; integration against real PostgreSQL), Playwright + axe (e2e with uploaded byte
buffers) — unchanged tooling.

**Target Platform**: unchanged (modern browsers; Node server on Vercel + Neon for the pilot, container +
PostgreSQL otherwise).

**Project Type**: web application — the existing pnpm monorepo (`apps/web` + `packages/db`); no new package.

**Performance Goals**: 001's budgets for every new screen (LCP ≤ 2.5 s, INP ≤ 200 ms, ≤ 300 KB script on
signed-in screens); lists paginated 20 with two statements per page; roster upload + validation of 5,000
rows ≤ 10 s and apply ≤ 10 s on pilot hosting (SC-002), with a fixed statement count (about 12) for any row
count up to 10,000.

**Constraints**: zero cross-college access; no file stored and no CSV content logged; uploaded file ≤ 2 MB and
≤ 10,000 rows; Server Action body limit raised to 3 MB for every action (a change to 001 behaviour,
research.md §15); WCAG 2.1 AA in both locales; Arabic-first.

**Scale/Scope**: pilot ≈ 5,000 students, 100 courses, 300 faculty members. This feature: 8 new screens
(+ 4 changed), 19 new Server Actions (+ 5 changed, + the global body limit), 7 tables, 1 static template
file, 22 PR batches.

No `NEEDS CLARIFICATION` remains (research.md resolves every item; product assumptions are in the spec's
Clarifications, marked "owner to confirm").

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.2.0 on 2026-11-19.

| Principle | Gate | How this plan satisfies it | Status |
|---|---|---|---|
| I. Code quality | Strict TS; lint/format clean; feature folders; Zod at boundaries; DB only via `@masari/db`; no new dependency without justification | New features `terms`, `courses`, `course-plan`, `roster`, `my-courses` follow the 001 layout; every action validates with Zod, the uploaded `File` included; all SQL in `@masari/db`; no new dependency. One clarification of 001's layering table: `features/*/rules.ts` may import **pure** helpers (`toWesternDigits`, `normalizeArabicText`) from `@masari/db` (no I/O) | ✅ |
| II. Testing | Tests in the same PR; real PostgreSQL; isolation test per tenant table; allow+deny test per permission; ≥ 80% coverage; deterministic | Each batch carries its tests (tasks.md); new/extended integration files with an explicit cross-college read and write case for every table and a cross-college case for every contract function (contracts/db-api.md §4); screens with an id are scanned through `prepare` hooks without touching the demo college (routes.md §1.1); 52-cell permission test + RBAC e2e additions; CSV/encoding/rules/plan/names are pure and unit-tested in covered paths (`src/lib`, `rules.ts`, `packages/db/src`); fixtures built in code with synthetic names; no clock dependence (current term is explicit; draft expiry tested by moving `created_at`) | ✅ |
| III. Security & privacy | RLS forced + tenant context; deny-by-default server guards; data minimisation; clean logs; audit; uploads type/size-checked; a student sees what is held about them | data-model.md §1; guards on 8 pages and 19 actions; only four roster columns stored, extra columns dropped while parsing; the file is never stored; draft rows only for error-free imports, cleared on resolution, 24-hour apply limit (research.md §6); logs carry event names and SQLSTATEs only; audit catalogue data-model.md §5; size/extension/magic-byte checks before decoding; verified students see their official record, unverified ones learn nothing about other people's data (FR-027); privacy notice updated (FR-029, owner review) | ✅ |
| IV. Arabic-first | Both catalogs; RTL logical utilities; LTR isolation; Western digits; Egyptian reality | Arabic headers and level words in the CSV; Windows-1256 support for Arabic Excel; Arabic-Indic digits accepted and stored as Western; Arabic course codes allowed; LTR isolates for codes and years, `dir="auto"` for descriptions/topics/names; native terms (routes.md §4) | ✅ |
| V. Accessibility | WCAG 2.1 AA; axe on every screen; keyboard; labelled controls | New screens appended to `screens.ts`; file input labelled and described; tables captioned; move buttons named per topic with focus management; badges with text (routes.md §5) | ✅ |
| VI. Performance | Server-first; pagination; bounded queries; long work outside the request | Server Components; two statements per list page; **exception**: roster validation/apply run inside the request, bounded (2 MB / 10,000 rows, fixed statement count proven by a test) — see Complexity Tracking; **owner acceptance needed before this documentation is merged** | ⚠️ exception, awaiting the owner |
| VII. Simplicity | No new package/service/queue; no speculative abstractions | No new package or infrastructure; placements once per study plan instead of per-term offerings; derived statuses instead of stored ones; the read API implements only the core reads 002's screens and the 004/005/007 MVPs need — reads with a single later caller (`courseStudents`, `groupSizes`, `listedStudents`, `knowledgeCourses`) are deferred to that caller under the contract's extension rule (research.md §14, catalog-read.md §5) | ✅ |
| VIII. Payment integrity | — | No payments. Delivers what Kitabi needs for watermarks and eligibility: a verified official name and locked level/division | ✅ (not applicable) |
| IX. Shared profile | One profile; documented contracts; graceful degradation; college content is data | Level/division stay only in `student_profiles`; the official list is the source those values are synced from, not a module's copy; contracts/catalog-read.md is the documented contract for profile → Kitabi (a student's courses), CodeJudge, and the timetable, with an extension rule for later reads (course descriptions/topics for Mu'eed and Mizan); every read degrades to empty results; catalog and roster are core and independent of module switches; courses, terms, and the roster are data | ✅ |
| X. Human review | No automatic penalty | Name mismatches go to a person (manual confirmation); a wrong verification is revoked by a person; losing verification only unlocks editing, it never penalises | ✅ |
| XI. Grounded AI | — | No AI in this feature; course descriptions become a grounded source for 003 through the contract | ✅ (not applicable) |
| XII. Phased scope | Follow the priority order | 002 is release M0 (phase 1: shared database); 001 has no blocking defect (PR-40, a performance improvement, is open for the owner's own test and touches none of these files); the roadmap's *Later* items are excluded | ✅ |
| Stack table | Use exactly the fixed stack | No change | ✅ |
| Workflow | One PR per batch; gates; review; merge rule | tasks.md PR-1 … PR-22, each with an Accept line. **This documentation PR is merged by the owner, not the orchestrator**: it adds a spec with assumed answers and asks for a principle VI exception (CLAUDE.md merge rule). The owner's answers to the questions in spec.md Clarifications and to the VI exception are recorded before the merge; a rejected answer is folded into these documents before PR-1 starts | ⏳ owner |

**Post-design re-check (after Phase 1, and again after the planning review of 2026-11-19)**: no new
violation. The one exception (principle VI) is recorded below with its bound and exit path and is listed for
the owner. The `users` table is still queried only from `repositories/users.ts` with an explicit tenant
filter (research.md §16).

## Project Structure

### Documentation (this feature)

```text
specs/002-academic-catalog/
├── spec.md
├── plan.md                  # this file
├── research.md              # Phase 0 — decisions (CSV/encoding §1, verified-lock §2, …)
├── data-model.md            # Phase 1 — tables, constraints, RLS, grants, locks, audit catalogue
├── quickstart.md            # Phase 1 — manual validation V1–V5
├── contracts/
│   ├── catalog-read.md      # module-facing read API (003, 004, 005, 007, 010)
│   ├── roster-csv.md        # the official-list file format and its problem codes
│   ├── db-api.md            # @masari/db additions + required integration tests
│   ├── server-actions.md    # actions, field rules, result codes, changed 001 actions
│   ├── permissions.md       # three permissions, navigation, RBAC expectations
│   └── routes.md            # screens, guards, message namespaces, a11y specifics
├── checklists/requirements.md
└── tasks.md                 # Phase 2 — PR batches
```

### Source Code (additions and changes; repository root)

```text
apps/web/
├── next.config.ts                         # Server Action body limit 3mb (PR-17)
├── public/templates/roster-template.csv   # PR-17
├── messages/{ar,en}.json                  # catalog.*, roster, courses, + extensions
├── e2e/
│   ├── support/{roster-files,responsive}.ts + screens.ts (prepare hooks, college_student)/db.ts extended
│   └── {catalog-terms,catalog-courses,catalog-plan,my-courses,roster-import,roster-verification}.spec.ts
│       (+ rbac, a11y lists, perf-budget, profile, admin-users, admin-settings extended)
└── src/
    ├── lib/{csv,academic}.ts (+ tests)
    ├── server/{audit,rate-limit}.ts, auth/permissions.ts            # extended
    ├── components/shell/nav-items.ts                                # extended
    ├── features/
    │   ├── terms/{schemas,rules,actions}.ts + components/
    │   ├── courses/{schemas,rules,actions}.ts + components/
    │   ├── course-plan/{schemas,actions}.ts + components/
    │   ├── my-courses/components/
    │   ├── roster/{schemas,rules,actions}.ts + components/
    │   └── profile, admin-users, tenant-settings, dashboard           # changed (§6 of server-actions.md)
    └── app/[locale]/(app)/
        ├── catalog/terms/page.tsx
        ├── catalog/courses/{page.tsx, new/page.tsx, [courseId]/page.tsx}
        ├── roster/{page.tsx, imports/[importId]/page.tsx}
        └── courses/{page.tsx, [courseId]/page.tsx}
packages/db/
├── migrations/                            # generated + custom *_security.sql per table group
├── src/
│   ├── constants.ts, index.ts, admin.ts, table-classification.ts    # extended
│   ├── text.ts                            # toWesternDigits, stripInvisible, normalizeArabicText
│   ├── roster/{names,plan,types}.ts       # pure
│   ├── schema/{academic-terms,courses,course-topics,course-placements,course-teachers,roster}.ts
│   ├── repositories/{terms,courses,placements,teaching,catalog,roster,roster-lock}.ts (+ users, student-profiles changed)
│   └── admin/{seed,test-support}.ts       # extended
└── test/{terms,courses,placements,teaching,catalog-read,roster-tables,roster-imports,roster-apply,roster-verification}.int.test.ts
    (+ rls-meta, users, student-profiles, test-support, admin extended)
```

**Structure Decision**: no new workspace package or service. Pure helpers that the database layer needs for
matching (`text.ts`, `roster/*`) live in `@masari/db` and are imported by web rules; CSV byte handling lives
in `apps/web/src/lib/csv.ts` because only the upload action uses it.

### Request lifecycle

Unchanged from 001 (plan.md "Request lifecycle"). The upload action reads the `File` only after the guard,
rate limit, and size check, and never passes bytes or decoded text outside the action.

### Implementation latitude (binding rule for the implementer)

Same as 001: spec.md, data-model.md, every file in contracts/, the file paths in tasks.md, and each batch's
Accept line are binding; internal helper names not listed in contracts, styling within `DESIGN.md`, and
library call names are not. A pinned-library difference is implemented with the same observable behaviour
and reported under **Spec deviation**; a binding item that cannot be met is reported, not improvised.

## Complexity Tracking

> Items that add structure beyond the simplest possible design, or deviate from a principle, with the reason
> each is accepted.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Deviation from constitution VI** ("bulk imports MUST run outside the request/response cycle"): roster validation and apply run inside their Server Actions | The PostgreSQL job runner is introduced by 003 with its first real consumer (roadmap R5); imports happen a few times per term | Building the job runner now pulls 003's infrastructure decisions forward. **Bound**: 2 MB / 10,000 rows; apply writes each set with one `unnest()` statement, so the statement count is fixed (≈ 12) whatever the row count — integration-tested with 10 and 2,000 rows; only the uploading manager waits. **Exit**: when 003 lands, `applyRosterImportAction` can enqueue the same repository call (no data-model change). **Needs the owner's acceptance before this documentation PR is merged** — not deferred to a later batch, because a rejection would redesign the upload and apply batches. |
| Draft rows stored as JSONB on `roster_imports` (≤ 24 h, error-free drafts only) | Preview-then-apply without a second upload | A `roster_import_rows` table adds schema for transient data; re-uploading to apply is error-prone |
| Expired drafts cleared at the next roster screen visit or upload, not on a schedule | No scheduler exists before 003 | A cross-college purge would need a privileged function for the runtime role; the 24-hour apply limit makes expired data unusable, but a college that never reopens the roster keeps it longer. The daily purge is a **tracked 003 item in `docs/roadmap.md`** |
| Per-college advisory lock for roster writes **and** for academic-data changes of a profile | Serialises apply, upload, confirmation, revocation, automatic verification, and a student's or administrator's change of code/level/division in one college | Row locks alone cannot cover "replace the whole list" against a concurrent single-profile link, and a `FOR SHARE` check alone lets a level change commit after an apply's sync |
| Composite FK `roster_entries (tenant_id, user_id, student_code)` → `student_profiles` + new `UNIQUE (tenant_id, user_id, student_code)` on a 001 table | The database guarantees the link points at a profile of the same college with the same code and that a verified code cannot change (foreign keys are checked without RLS, so `tenant_id` must be in the key) | Application-only checks would leave the lock one bug away from failing |
| `revoked_user_id` on `roster_entries` | Revoking an automatic verification must stick; otherwise the next import or rename re-links the impostor | A separate blocklist table for a one-to-one fact |
| Server Action body limit raised to 3 MB (all actions, public ones included) | A 2 MB CSV must reach our validation to get a translated error | Default 1 MB rejects large colleges' lists with an untranslated framework error; a route handler for uploads is not allowed by the constitution's server-boundary rule. Cost weighed in research.md §15 (parsing before the guard; platform limit already ≈ 4.5 MB); re-checked by 009 |
| Core module reads implemented before their consumers (PR-10, PR-21) | Spec FR-033 / constitution IX documented contract, with cross-college tests next to the tables | Letting the first consumer define the core reads would let 004/005/007 each query catalog tables their own way; single-consumer reads are deferred (catalog-read.md §5) |
