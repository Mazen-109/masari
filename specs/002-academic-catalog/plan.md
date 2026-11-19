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
columns; apply is one bounded transaction driven by a pure planning function shared with the preview;
verification is a link on the official entry, with the lock enforced in the repository and by a composite
foreign key; modules read everything through a documented, tested `catalog`/`roster` read API.

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
rows ≤ 10 s and apply ≤ 10 s on pilot hosting (SC-002), with a statement count independent of the row count.

**Constraints**: zero cross-college access; no file stored and no CSV content logged; uploaded file ≤ 2 MB and
≤ 10,000 rows; Server Action body limit raised to 3 MB; WCAG 2.1 AA in both locales; Arabic-first.

**Scale/Scope**: pilot ≈ 5,000 students, 100 courses, 300 faculty members. This feature: 8 new screens
(+ 4 changed), 19 new Server Actions (+ 5 changed), 7 tables, 1 static template file, 21 PR batches.

No `NEEDS CLARIFICATION` remains (research.md resolves every item; product assumptions are in the spec's
Clarifications, marked "owner to confirm").

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.2.0 on 2026-11-19.

| Principle | Gate | How this plan satisfies it | Status |
|---|---|---|---|
| I. Code quality | Strict TS; lint/format clean; feature folders; Zod at boundaries; DB only via `@masari/db`; no new dependency without justification | New features `terms`, `courses`, `course-plan`, `roster`, `my-courses` follow the 001 layout; every action validates with Zod, the uploaded `File` included; all SQL in `@masari/db`; no new dependency. One clarification of 001's layering table: `features/*/rules.ts` may import **pure** helpers (`toWesternDigits`, `normalizeArabicText`) from `@masari/db` (no I/O) | ✅ |
| II. Testing | Tests in the same PR; real PostgreSQL; isolation test per tenant table; allow+deny test per permission; ≥ 80% coverage; deterministic | Each batch carries its tests (tasks.md); 9 new/extended integration files with a cross-college case for every table and contract function (contracts/db-api.md §4); 52-cell permission test + RBAC e2e additions; CSV/encoding/rules/plan/names are pure and unit-tested in covered paths (`src/lib`, `rules.ts`, `packages/db/src`); fixtures built in code with synthetic names; no clock dependence (current term is explicit; draft expiry tested by moving `created_at`) | ✅ |
| III. Security & privacy | RLS forced + tenant context; deny-by-default server guards; data minimisation; clean logs; audit; uploads type/size-checked; a student sees what is held about them | data-model.md §1; guards on 8 pages and 19 actions; only four roster columns stored, extra columns dropped while parsing; the file is never stored; draft rows only for error-free imports, cleared on resolution, 24-hour apply limit (research.md §6); logs carry event names and SQLSTATEs only; audit catalogue data-model.md §5; size/extension/magic-byte checks before decoding; verified students see their official record, unverified ones learn nothing about other people's data (FR-027); privacy notice updated (FR-029, owner review) | ✅ |
| IV. Arabic-first | Both catalogs; RTL logical utilities; LTR isolation; Western digits; Egyptian reality | Arabic headers and level words in the CSV; Windows-1256 support for Arabic Excel; Arabic-Indic digits accepted and stored as Western; Arabic course codes allowed; LTR isolates for codes and years, `dir="auto"` for descriptions/topics/names; native terms (routes.md §4) | ✅ |
| V. Accessibility | WCAG 2.1 AA; axe on every screen; keyboard; labelled controls | New screens appended to `screens.ts`; file input labelled and described; tables captioned; move buttons named per topic with focus management; badges with text (routes.md §5) | ✅ |
| VI. Performance | Server-first; pagination; bounded queries; long work outside the request | Server Components; two statements per list page; keyset pagination in the contract; **exception**: roster validation/apply run inside the request, bounded (2 MB / 10,000 rows, constant statement count) — see Complexity Tracking | ⚠️ justified exception |
| VII. Simplicity | No new package/service/queue; no speculative abstractions | No new package or infrastructure; placements once per study plan instead of per-term offerings; derived statuses instead of stored ones; the module read API is a spec requirement (FR-033), not speculation (research.md §14) | ✅ |
| VIII. Payment integrity | — | No payments. Delivers what Kitabi needs for watermarks and eligibility: a verified official name and locked level/division | ✅ (not applicable) |
| IX. Shared profile | One profile; documented contracts; graceful degradation; college content is data | Level/division stay only in `student_profiles`; the official list is the source those values are synced from, not a module's copy; contracts/catalog-read.md is the documented contract for Mu'eed → Mizan (course descriptions/topics) and profile → Kitabi (a student's courses), plus CodeJudge and the timetable; every read degrades to empty results; catalog and roster are core and independent of module switches; courses, terms, and the roster are data | ✅ |
| X. Human review | No automatic penalty | Name mismatches go to a person (manual confirmation); losing verification only unlocks editing, it never penalises | ✅ |
| XI. Grounded AI | — | No AI in this feature; course descriptions become a grounded source for 003 through the contract | ✅ (not applicable) |
| XII. Phased scope | Follow the priority order | 002 is release M0 (phase 1: shared database); 001 has no blocking defect (PR-40, a performance improvement, is open for the owner's own test and touches none of these files); the roadmap's *Later* items are excluded | ✅ |
| Stack table | Use exactly the fixed stack | No change | ✅ |
| Workflow | One PR per batch; gates; review; merge rule | tasks.md PR-1 … PR-21, each with an Accept line; the orchestrator must stop for the owner on the Complexity Tracking exception (an unaccepted deviation) before merging PR-16 | ✅ |

**Post-design re-check (after Phase 1)**: no new violation. The one exception (principle VI) is recorded
below with its bound and exit path and is listed for the owner. The `users` table is still queried only from
`repositories/users.ts` with an explicit tenant filter (research.md §16).

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
├── next.config.ts                         # Server Action body limit 3mb (PR-16)
├── public/templates/roster-template.csv   # PR-16
├── messages/{ar,en}.json                  # catalog.*, roster, courses, + extensions
├── e2e/
│   ├── support/{catalog,roster-files,roster}.ts + screens.ts/db.ts extended
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
│   ├── text.ts                            # toWesternDigits, normalizeArabicText
│   ├── roster/{names,plan,types}.ts       # pure
│   ├── schema/{academic-terms,courses,course-topics,course-placements,course-teachers,roster}.ts
│   ├── repositories/{terms,courses,placements,teaching,catalog,roster}.ts (+ users, student-profiles changed)
│   └── admin/{seed,test-support}.ts       # extended
└── test/{terms,courses,placements,teaching,catalog-read,roster-imports,roster-apply,roster-verification}.int.test.ts
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
| **Deviation from constitution VI** ("bulk imports MUST run outside the request/response cycle"): roster validation and apply run inside their Server Actions | The PostgreSQL job runner is introduced by 003 with its first real consumer (roadmap R5); imports happen a few times per term | Building the job runner now pulls 003's infrastructure decisions forward. **Bound**: 2 MB / 10,000 rows, constant statement count (integration-tested), only the uploading manager waits. **Exit**: when 003 lands, `applyRosterImportAction` can enqueue the same repository call (owner decision; no data-model change). **Needs the owner's acceptance** (listed in the feature summary). |
| Draft rows stored as JSONB on `roster_imports` (≤ 24 h, error-free drafts only) | Preview-then-apply without a second upload | A `roster_import_rows` table adds schema for transient data; re-uploading to apply is error-prone |
| Expired drafts cleared at the next roster screen/action, not on a schedule | No scheduler exists before 003 | A cross-college purge would need a privileged function for the runtime role; the 24-hour apply limit already makes expired data unusable. Follow-up for 003: a daily purge job |
| Per-college advisory lock for roster writes | Serialises apply, upload, manual confirmation, and automatic verification of one college | Row locks alone cannot cover "replace the whole list" against a concurrent single-profile link |
| Composite FK `roster_entries (user_id, student_code)` → `student_profiles` + new `UNIQUE (user_id, student_code)` on a 001 table | The database guarantees the link points at the profile with the same code and that a verified code cannot change | Application-only checks would leave the lock one bug away from failing |
| Server Action body limit raised to 3 MB (all actions) | A 2 MB CSV must reach our validation to get a translated error | Default 1 MB rejects large colleges' lists with an untranslated framework error; a route handler for uploads is not allowed by the constitution's server-boundary rule |
| Module read API implemented before its consumers (PR-10, PR-13) | Spec FR-033 / constitution IX documented contract, with cross-college tests next to the tables | Letting the first consumer define it would let 004/005/007 each query catalog tables their own way |
