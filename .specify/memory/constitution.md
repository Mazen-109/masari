<!--
SYNC IMPACT REPORT

Version change: 1.1.0 → 1.2.0
Bump rationale (MINOR): by the owner's decision of 2026-11-16 the product-specific draft constitution
(draft v1.0.0 of 2026-11-09: seven product principles + platform constraints) is folded into this document.
Five principles are added, three are materially expanded (II, III, IV), and two get one line each (V, VII);
no principle, gate, or stack row is removed or redefined, and the numbering I–VII is unchanged (feature
documents cite those numbers).
History: 1.0.0 (2026-11-14) first ratified text, principles I–VII, stack, workflow, governance ·
1.1.0 (2026-11-15) Orchestrator role and merge rule · 1.2.0 (2026-11-16) this merge.

Added principles:
  VIII. Payment & Paid-Content Integrity (NON-NEGOTIABLE)  ← draft II (codes, watermark, receipts, sandbox)
  IX.   One Shared Student Profile, Integrated Modules     ← draft III
  X.    Human Review for Consequential Decisions           ← draft IV
  XI.   Grounded and Practical AI                          ← draft V
  XII.  Phased Scope                                       ← draft VI (its YAGNI half was already VII)
Modified principles:
  II.  Testing Discipline — adds the critical paths that MUST be tested and "every acceptance scenario is
       verifiable by a test or a documented manual check" (draft VII)
  III. Security & Student-Data Privacy — names the four roles; data visible only to the roles that need it; a
       student can see what is held about them; OWASP Top 10 testing before any delivery or demo to a real
       college; the Kitabi bullet moved to principle VIII; the AI bullet points to X and XI
  IV.  Arabic-First — Arabic for every notification, error, receipt, and AI output; RTL designed and verified
       first; Egyptian college reality; formal vs colloquial Arabic; NO Arabic text rendered by an
       image-generation model (generated images carry no text; Arabic text is overlaid in code)
  V.   Accessibility — UI work SHOULD use the Impeccable design skill
  VII. Simplicity — precedence order extended to the twelve principles
Modified sections:
  Technology Stack & Architecture Constraints — pilot-data rule (one college's own data, no external approvals)
  Development Workflow & Quality Gates — clarify step in the Spec Kit flow; specs state what and why,
    technology belongs in the plan; `main` stays runnable; the PR size target no longer counts end-to-end
    spec files and an oversize PR is split or explained, never a reason to stop
  Governance — amendments are made with the speckit-constitution skill; CLAUDE.md and templates MUST stay
    consistent with this document
Removed sections: none
Not carried over from the draft (superseded by owner decisions already in 1.1.0, or weaker than this text):
  - "The project owner reviews and approves merges to main" → the Merge rule stays (the orchestrator merges
    on green CI + reviewer APPROVE; the owner is asked in the cases listed there).
  - "Basic accessibility" → principle V (WCAG 2.1 AA) is stricter and stays.

Template and document alignment check:
  ✅ .specify/templates/plan-template.md   — "Constitution Check" is filled per feature from this file; no edit needed
  ✅ .specify/templates/spec-template.md   — no conflict (specs stay technology-agnostic)
  ✅ .specify/templates/tasks-template.md  — template says tests are optional; this constitution makes tests
                                             MANDATORY (principle II) and adds "PR batches". Feature tasks.md
                                             files follow the constitution; the template itself is not modified
                                             (speckit-constitution writes only this file).
  ✅ CLAUDE.md                             — product rules VIII–XII summarised; PR size rule updated
  ✅ docs/roadmap.md                       — release order equals principle XII; 013 review wording and the
                                             005 dependency corrected
  ✅ specs/001-platform-foundation/plan.md — Constitution Check re-run against 1.2.0 (rows VIII–XII added)
  ✅ docs/delegation.md                    — model roles match (Opus 5.5 implements, Fable 5.2 reviews)

Earlier consistency edit (2026-11-15, version 1.1.0, made while analysing feature 001): principle III names
the only tables exempt from forced RLS (tenant registry, auth identity tables) and their compensating controls.

Deferred items / TODOs: none.
Open product questions for the owner: printed or PDF textbooks (principle VIII, docs/roadmap.md §5 no. 1);
whether a student may see their own AI drawing before faculty review (principle X, docs/roadmap.md §5 no. 5).
Unverified at ratification: exact package versions (npm registry unreachable from the planning sandbox);
majors are fixed below, exact versions are pinned by task T001 of feature 001.
Merging: this pull request amends the constitution and the roadmap, so by the Merge rule the owner merges it,
not the orchestrator.
-->

# Masari Constitution

Masari (مساري, "my path") is a multi-tenant platform that accompanies a university student from the first
day of college to graduation and employment, and serves faculty, Student Affairs, and college
administration. This constitution sets the non-negotiable rules that every feature, plan, and line of code
follows. Product source of truth: `docs/masari-spec-en.html` (rendered as `docs/masari-spec-en.pdf`).
Delivery order: `docs/roadmap.md`.

Normative words: **MUST / MUST NOT** are binding and enforced in review; **SHOULD** may be deviated from
only with a written reason in the pull request.

## Core Principles

### I. Code Quality & Maintainability

- All application code MUST be TypeScript in `strict` mode with `noUncheckedIndexedAccess`. `any`,
  `@ts-ignore`, `@ts-expect-error`, and `eslint-disable` are forbidden unless the same line carries a
  comment explaining why; the reviewer may reject the reason.
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` MUST pass with zero errors and zero warnings.
- Code is organised by feature, with one direction of dependencies:
  `app routes → features → server/lib → @masari/db`. A product module (Mu'eed, CodeJudge, Mizan, Kitabi,
  CareerMap, Tadreeb) MUST NOT import another module's internals; modules exchange data only through the
  shared core (student profile, catalog) or an explicitly exported module interface.
- All untrusted input (forms, URL parameters, files, webhooks, LLM output) MUST be validated with a Zod
  schema at the server boundary before use.
- Database access MUST go through `@masari/db` repositories. Raw SQL is allowed only inside `@masari/db`
  and only with parameter binding (never string concatenation).
- Names, comments, commit messages, and documentation are written in English. User-facing text is never
  hardcoded (principle IV).
- No dead code, no commented-out code, no `TODO` without a linked task ID.
- A new runtime dependency MUST be justified in the PR description (purpose, alternatives, licence,
  maintenance status). Only permissive licences are allowed in shipped code (MIT, Apache-2.0, BSD, ISC,
  OFL for fonts); GPL/AGPL code MUST NOT be linked into the application because the product is intended
  to be licensed to other universities.

**Rationale**: a small student team plus AI agents maintain this code for years; strictness and one obvious
place for everything are cheaper than cleverness.

### II. Testing Discipline (NON-NEGOTIABLE)

- Every pull request that adds or changes behaviour MUST include automated tests for that behaviour in
  the same pull request. A bug fix MUST start with a test that fails without the fix.
- Test layers (use the lowest layer that proves the behaviour):
  - **Unit** (Vitest): pure logic — validation schemas, permission rules, formatters, algorithms.
  - **Integration** (Vitest against a real PostgreSQL, never a mock or in-memory substitute): repositories,
    migrations, row-level-security policies, transactions.
  - **End-to-end** (Playwright against the production build): every user story's acceptance scenarios, in
    Arabic by default, with at least one English run per story.
- Every tenant-scoped table MUST have an integration test proving that tenant A cannot read or write
  tenant B's rows.
- Every permission MUST have a test for both an allowed role and a denied role.
- **Critical paths**: the following MUST have passing automated tests before the feature that delivers
  them is considered done — payment confirmation and code assignment (including concurrent purchases),
  role permissions, timetable conflict-freedom, CodeJudge grading against test cases, and plagiarism
  detection with renamed variables. A bug found in a critical path MUST get a regression test with the fix.
- Every feature spec MUST include acceptance scenarios, and each scenario MUST be verifiable by an
  automated test or, where automation is impossible (for example a usability outcome), a documented manual
  check.
- Line coverage MUST be ≥ 80% for `packages/db/src` and for the unit-testable parts of the web app
  (`src/server`, `src/lib`, `src/modules`, and every feature's `schemas.ts` / `rules.ts`). Coverage is a
  floor, not a goal: untested acceptance scenarios fail review regardless of the percentage.
- Tests MUST be deterministic: no dependency on external networks, wall-clock timing, or test order.
  External services (payment gateways, LLM providers, email) are replaced by local fakes at the service
  boundary. Skipped or `.only` tests MUST NOT be merged.

**Rationale**: the implementer is an AI agent and the reviewer cannot manually exercise every flow; tests
are the contract that makes one-PR-per-task delivery safe. The critical paths are where a silent failure
costs money, fairness, or trust, and they are what the demo depends on.

### III. Security & Student-Data Privacy (NON-NEGOTIABLE)

- **Tenant isolation**: every table that holds college-owned data MUST carry `tenant_id`, MUST have
  PostgreSQL row-level security enabled and forced, and MUST be accessed only inside a transaction that
  sets the tenant context. The application connects with a database role that is neither superuser nor
  `BYPASSRLS`; the app MUST refuse to start otherwise. The only tables exempt from forced row-level
  security are the tenant registry itself and the authentication library's identity tables (users,
  sessions, accounts, verification tokens), which must be readable before a tenant is known; they MUST be
  queried only by the authentication library and by repository functions that take an explicit tenant
  filter and have cross-tenant tests.
- **Authorisation**: deny by default. Access control is role-based with four separate roles — student,
  faculty member, Student Affairs, administration. Every page, server action, and route handler MUST check
  the session and the required permission on the server; hiding a link or a button is not access control.
  Proxy/middleware MUST NOT be the only authorisation layer.
- **Authentication**: use the adopted auth library (no hand-rolled password hashing, session, or token
  logic). Passwords are hashed with a memory-hard algorithm; sessions use `HttpOnly`, `Secure`,
  `SameSite=Lax` cookies; sign-in, registration, and recovery endpoints are rate-limited; responses MUST
  NOT reveal whether an email is registered.
- **Secrets**: no secret, credential, token, private key, or real personal data may be committed — not in
  code, tests, fixtures, docs, or CI logs. Configuration comes from environment variables validated at
  start-up; `.env.example` contains placeholders only. A leaked secret MUST be rotated immediately;
  deleting the commit is not sufficient.
- **Data minimisation**: collect only the fields a shipped feature needs. National ID numbers, home
  addresses, and phone numbers MUST NOT be collected unless a ratified spec requires them.
- **Logs**: logs and error reports MUST NOT contain passwords, tokens, email addresses, names, student
  codes, CV contents, or payment data; use internal IDs. Security-relevant actions (sign-in, role change,
  suspension, invitation, payment, code assignment) MUST be written to the append-only audit log.
- **Privacy**: personal data is processed under Egypt's Personal Data Protection Law (No. 151/2020):
  users see a privacy notice and give explicit consent at registration; each college's data is logically
  isolated and exportable/deletable per college. Student data (grades, CVs, submissions, purchases) MUST
  be visible only to the roles that need it, and a student MUST be able to see what the platform holds
  about them. Student personal data MUST NOT be sent to third parties (including LLM providers) beyond the
  minimum the feature strictly requires, and never for model training.
- **Web hardening**: OWASP Top 10 is the baseline. Output is escaped by default (no
  `dangerouslySetInnerHTML` with untrusted content), state-changing requests are CSRF-protected,
  security headers and a Content-Security-Policy are set, uploads are type/size-checked and never executed,
  and dependencies with known high-severity vulnerabilities block merging. The platform MUST be tested
  against the OWASP Top 10 before any delivery or demo to a real college (roadmap feature 009).
- **Payments and paid content** (Kitabi): governed by principle VIII.
- **AI safety**: LLM output is untrusted input. It MUST NOT trigger privileged actions without a server-side
  permission check. Human review of AI output is governed by principle X, grounding by principle XI.

**Rationale**: Masari stores data about real students and will handle payments; a single cross-college leak
would end the product commercially and harm real people.

### IV. Arabic-First, RTL-Native, Bilingual

- Arabic (`ar`, right-to-left) is the default and primary locale; English (`en`) is fully supported. Every
  user-facing screen, message, notification, error, receipt, and AI output MUST be available in Arabic.
  Every user-facing string MUST exist in both `messages/ar.json` and `messages/en.json` in the same PR; CI
  fails on missing or extra keys. Hardcoded user-facing text in components is forbidden.
- Layouts are designed right-to-left first and verified in RTL; left-to-right is the secondary direction.
- Content MUST reflect Egyptian college reality (regulations, level and division, Fawry, local terms)
  rather than a translated foreign tool. Arabic copy is written natively with the terms Egyptian students
  actually use (الفرقة، الشعبة، شئون الطلاب، اللائحة); it is never a word-for-word translation of the
  English. Formal Arabic (clear Modern Standard Arabic) is used for the interface and for official content
  (regulations, receipts, announcements); Egyptian colloquial Arabic is used only where the product spec
  calls for it (audio summaries, student-facing feedback).
- Arabic text MUST never be rendered by an image-generation model. Generated images carry no text; Arabic
  text is overlaid in code, with correct shaping and direction.
- Layout MUST use CSS logical properties and Tailwind logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`,
  `start-*`, `end-*`, `text-start`, `text-end`). Physical direction utilities (`ml-*`, `mr-*`, `pl-*`,
  `pr-*`, `left-*`, `right-*`, `text-left`, `text-right`) are forbidden and checked in CI. Directional
  icons are mirrored in RTL; `<html>` carries the correct `lang` and `dir`.
- Left-to-right fragments inside Arabic text (emails, URLs, code, student codes) MUST be isolated with
  `dir="ltr"` or `<bdi>`. Letter-spacing and italics MUST NOT be applied to Arabic text.
- Numbers use Western digits (0–9) in both locales; dates use the Gregorian calendar and the
  `Africa/Cairo` time zone unless a spec says otherwise. All formatting goes through the shared helpers.
- Emails, PDFs, composed images (posters, diagrams, video subtitles), and AI answers follow the same rule:
  Arabic first, correct shaping and direction, English available.

**Rationale**: the product's differentiator is being genuinely Arabic and Egyptian, not a translated
foreign tool; RTL defects are the first thing an Arabic reader notices, and Arabic text inside generated
images is a known failure point.

### V. Accessibility

- All screens MUST meet WCAG 2.1 level AA in both locales and both directions.
- Automated accessibility scans (axe) run in end-to-end tests on every screen of every user story; zero
  `serious` or `critical` violations are allowed.
- Every flow MUST be completable with the keyboard alone, with a visible focus indicator, a skip-to-content
  link, and a logical focus order in RTL and LTR.
- Semantic HTML first; ARIA only when no native element exists. Every form control has a programmatic
  label; errors are announced and linked to their field; meaning is never conveyed by colour alone.
- Text contrast ≥ 4.5:1 (3:1 for large text and UI components); touch targets ≥ 44×44 CSS px; the UI
  remains usable at 200% zoom and at 320 px width; `prefers-reduced-motion` is respected.
- UI work SHOULD use the Impeccable design skill installed in the repository (`.claude/skills/impeccable`)
  together with `PRODUCT.md` and `DESIGN.md`.

**Rationale**: a university platform is a public-facing service for every student, including those using
assistive technology and low-end phones.

### VI. Performance on Real Student Devices

Budgets, measured on the production build with a mid-range Android phone profile on a 4G connection:

- Largest Contentful Paint ≤ 2.5 s, Interaction to Next Paint ≤ 200 ms, Cumulative Layout Shift ≤ 0.1
  (75th percentile) on every primary screen.
- JavaScript transferred on first load: ≤ 200 KB (compressed) on public screens and ≤ 300 KB on signed-in
  screens. This budget is enforced by an automated test in CI.
- Server work for an interactive request (page render or server action, excluding external AI/payment
  calls) SHOULD complete in ≤ 500 ms at the 95th percentile with 500 concurrent users per college.
- Rendering is server-first: client components only where interaction requires them. Lists are paginated
  (default 20 rows); queries are bounded and indexed; N+1 query patterns fail review.
- Long-running work (AI generation, code execution, media rendering, bulk imports) MUST run outside the
  request/response cycle and report progress; it MUST NOT block a page.

**Rationale**: most students use Android phones on mobile data; a slow platform will not replace the paper
queue.

### VII. Simplicity (YAGNI)

- Build only what the current feature's spec requires. No speculative abstractions, configuration options,
  or generic frameworks "for later".
- One deployable web application (a modular monolith) plus one database. A new service, queue, cache,
  workspace package, or datastore requires an entry in the plan's Complexity Tracking table explaining why
  the simpler option fails.
- Prefer the platform and the already-adopted libraries over adding a dependency; prefer boring,
  well-documented technology that a student can learn from official docs.
- Prefer deleting code to adding configuration. Three similar lines are better than a premature
  abstraction; extract on the third real use.
- When principles conflict, the order of precedence is: III (security & privacy) → VIII (payment &
  paid-content integrity) → II (testing) → X (human review) → XI (grounded AI) → V (accessibility) →
  IV (Arabic-first) → IX (shared profile) → XII (phased scope) → VII (simplicity) → I (code quality) →
  VI (performance).

**Rationale**: six modules and an AI layer are a heavy scope for one developer working with AI agents over
about six months; every unnecessary moving part is paid for in every later feature.

### VIII. Payment & Paid-Content Integrity (NON-NEGOTIABLE)

- Every textbook access code MUST be assigned to exactly one student, exactly once, and only after a
  confirmed payment. Assignment MUST be atomic: two concurrent purchases can never receive the same code,
  and a paid student can never receive zero codes.
- Codes MUST be bound to the student's account, MUST NOT be transferable, MUST be encrypted at rest, and
  MUST never be logged in plain text.
- Every downloaded PDF MUST carry a watermark with the student's name and student code.
- Every payment transaction and every code assignment MUST be written to the append-only audit log, and
  every transaction MUST produce an electronic receipt.
- Kitabi MUST use the payment gateway's sandbox/test mode until the college has its own merchant account
  (a signed merchant agreement). Target payment methods: card, Fawry, and mobile wallet. Switching to live
  payments is a deliberate configuration change, never a code default.
- Card data never touches Masari servers; payment webhooks are signature-verified and idempotent.
- **Open question**: whether textbooks are printed or PDF is not settled. If printed, Kitabi adds pickup
  booking with a QR code; features MUST NOT assume one answer until the owner settles it.

**Rationale**: Kitabi handles money and paid content; one duplicated or leaked code damages trust in the
whole platform.

### IX. One Shared Student Profile, Integrated Modules

- All modules MUST read from and write to one shared student profile (level, division, courses, grades,
  skills) as the single source of truth. A module MUST NOT keep its own copy of profile data that can drift.
- Data passed directly between modules MUST go through an explicit, documented contract (principle I: the
  shared core or an exported module interface). The defined paths are: Mu'eed → Mizan (course
  descriptions), CodeJudge → CareerMap (weak points), CareerMap → Tadreeb (required skills), and Kitabi
  reading the student's courses from the shared profile. A new path needs a documented contract in the
  plan of the feature that adds it.
- Each module MUST remain independently usable and testable: if another module is missing, disabled, or
  not yet built, it degrades gracefully instead of failing.
- College-specific content (regulations, course catalog, levels, divisions, books) MUST be data, not code,
  so that another college can adopt Masari by changing data only.

**Rationale**: "integrated, not bundled" is what makes Masari more than a set of side-by-side tools, and
portability to other colleges is a stated goal.

### X. Human Review for Consequential Decisions

- Plagiarism (similarity) results from CodeJudge are evidence for a faculty member to review; the system
  MUST NOT penalise a student automatically.
- Mizan exam analysis is advisory; the faculty member makes the final approval decision.
- AI-generated educational drawings and exam diagrams MUST pass a faculty review step before they are
  published to students.
- Early-warning alerts go to the academic advisor; they MUST NOT trigger automatic consequences for the
  student.
- Automatic grades from test cases MUST show the student which tests passed and which failed, so that
  every grade is explainable.

**Rationale**: decisions that affect a student's grades, record, or what students learn need an
accountable human, and automated signals can be wrong.

### XI. Grounded and Practical AI

- The Mu'eed assistant MUST answer only from the college's official regulation documents (retrieval-
  augmented generation), MUST cite the source section for each answer, and MUST say it does not know rather
  than invent an answer when the documents do not cover the question.
- Educational drawings MUST be generated as code (Mermaid or SVG) rather than raster images, so that they
  can be reviewed and corrected.
- Video MUST be composed from images, audio, and subtitles (for example with FFmpeg) rather than generated
  end-to-end from text.
- Every AI feature MUST have a defined fallback for when the model or provider is unavailable, and its cost
  per use MUST be estimated in the plan.
- Student personal data sent to an external AI provider MUST be the minimum needed for the task
  (principle III).

**Rationale**: these are the mitigations the product spec chose for scientific errors, cost, and
reliability; making them rules keeps every AI feature consistent.

### XII. Phased Scope

- Work MUST follow the product spec's scope priorities, in order (`docs/roadmap.md` maps them to features
  and releases):
  1. Foundation: accounts, roles and permissions, and the shared database.
  2. Demo-critical modules: Mu'eed, CodeJudge, and Kitabi.
  3. Complementary modules: Mizan (light version: Bloom classification, table of specifications, report),
     CareerMap, and Tadreeb.
  4. AI layer: the three candidate features first (concept drawing, college posters, explain-in-a-minute
     video), then the rest if time allows.
- A later phase MUST NOT start while an earlier phase has blocking defects, unless the exception is
  justified in the plan.
- Within a phase, the simplest design that meets the spec wins (principle VII).

**Rationale**: a working demo of the strongest modules beats many half-finished ones.

## Technology Stack & Architecture Constraints

The stack is fixed by this constitution. Changing a row is a constitutional amendment (see Governance).
Major versions are fixed here; exact versions are pinned in `package.json` / `pnpm-lock.yaml`.

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), one language end to end | One skill set for a student team; compile-time safety for AI-written code |
| Runtime / package manager | Node.js 24 LTS (minimum 22) · pnpm 10 workspaces | LTS support window; fast, strict, disk-efficient monorepo installs |
| Web framework | Next.js 16 (App Router, React 19, Server Components, Server Actions) | Most widely documented React framework; server-first rendering suits slow phones; one app for UI and backend |
| UI | Tailwind CSS 4 + shadcn/ui components (copied into the repo, Radix primitives) + lucide icons | Logical-property utilities make RTL natural; accessible primitives; no runtime UI library lock-in |
| i18n | next-intl 4 (`ar` default, `en`) with ICU messages | Mature App Router support, typed message keys, RTL-aware |
| Database | PostgreSQL 16+ with row-level security; `pgvector` when an AI feature needs embeddings | One database for relational data, tenant isolation, and vectors; runs anywhere |
| Data access | Drizzle ORM + drizzle-kit SQL migrations; `pg` driver | SQL-transparent, type-safe, transactions with tenant context; migrations are reviewable SQL |
| Authentication | Better Auth 1.x (email + password, database sessions) | Maintained TypeScript auth library with a Drizzle adapter; self-hostable; no per-user fees |
| Validation | Zod 4 | Single schema language for forms, env, and LLM output |
| Email | Nodemailer over SMTP (any provider); capture-to-file transport in dev/test | Provider-agnostic; works on-premises |
| AI access | Vercel AI SDK behind one server-side gateway module; Claude models by default (`claude-haiku-5-5` for high-volume, `claude-sonnet-5-5` / `claude-opus-5-5` for hard reasoning); provider and model are configuration | One interface, swappable provider, central cost and privacy controls |
| Testing | Vitest (unit + integration) · Playwright + axe (end-to-end, accessibility) | Fast, standard, CI-friendly |
| Quality tooling | ESLint (flat config, typescript-eslint, eslint-config-next) · Prettier · gitleaks · `pnpm audit` | Standard gates |
| CI | GitHub Actions | Free for the repository; required status checks |
| Hosting (pilot) | Vercel (web) + Neon (PostgreSQL) free tiers | Zero cost for the pilot and demo |
| Hosting (production / other universities) | The same app as a Docker container + any PostgreSQL 16+ (VPS or on-premises) | Egyptian universities often require local hosting; Vercel's free tier is non-commercial |

Architecture rules:

- **Monorepo layout**: `apps/web` (the Next.js application) and `packages/db` (schema, migrations,
  row-level-security policies, repositories, tenant context). Additional apps/packages require Complexity
  Tracking justification (principle VII).
- **Multi-tenancy**: one shared database and schema; a tenant is one college. Each user belongs to exactly
  one tenant. Tenant-specific behaviour is data (settings, enabled modules, regulations, catalog), never a
  code fork. Each of the six product modules can be enabled or disabled per tenant.
- **Pilot data**: the platform MUST be runnable with one college's own data and without approvals from
  external bodies.
- **Portability**: code MUST NOT depend on a hosting provider's proprietary runtime APIs (no edge-only
  code paths, no provider-specific KV/queue/blob SDKs, no provider-specific database drivers). Anything
  provider-specific sits behind an interface with a self-hostable implementation.
- **Server boundary**: mutations are Server Actions returning a typed result; route handlers are used only
  for webhooks, health checks, file downloads, and auth callbacks. There is no separate public REST API
  until a spec requires one.
- **Files**: uploaded or generated files go to S3-compatible object storage behind an interface, never to
  the application's local disk or the database.
- **Background work**: introduced by the first feature that needs it, as a PostgreSQL-backed job queue with
  a worker process; no additional infrastructure (Redis, Kafka) without an amendment.
- **Untrusted code execution** (CodeJudge) MUST happen in an isolated sandbox service, never in the web
  application's process or container.
- **Migrations** are forward-only, committed SQL, applied by CI and deployment; a merged migration is never
  edited.

## Development Workflow & Quality Gates

**Roles**

- **Owner** (Mazen): approves the roadmap, specs, and constitution changes; owns all secrets and external
  accounts; may merge any pull request that satisfies the merge rule below.
- **Orchestrator** — the main Claude Code session that dispatches work (see `docs/delegation.md`): assigns
  one PR batch at a time to the implementer, requests the review, and — by the owner's standing
  authorisation — squash-merges a pull request when the merge rule below is satisfied, then continues with
  the next batch without waiting for the owner.
- **Architect / Reviewer** — Claude Fable 5.2 (`claude-fable-5-2`, high effort): writes the constitution,
  specs, plans, and tasks; reviews every pull request read-only; never writes implementation code in a PR
  it reviews.
- **Implementer** — Claude Opus 5.5 (`claude-opus-5-5`, medium effort): implements exactly one PR batch per
  pull request; never merges and never reviews its own work.

**Spec-driven flow**: constitution → `docs/roadmap.md` → per feature `specs/NNN-name/` (specify → clarify
when needed → plan → tasks → analyze) → implementation. No implementation starts for a feature until its
`spec.md`, `plan.md`, and `tasks.md` exist and the analyze pass has no CRITICAL finding. Specs describe
what and why in the user's language; technology choices belong in the plan. `main` MUST stay in a runnable
state.

**One task = one pull request**

- `tasks.md` groups its task items (`T###`) into ordered **PR batches** (`PR-1`, `PR-2`, …). One PR batch
  is the unit of assignment, implementation, review, and merge: exactly one pull request per batch, and a
  pull request never contains work from two batches.
- Batches are implemented in order unless `tasks.md` marks them parallel-safe. A batch starts from an
  up-to-date `main` after the previous batch is merged.
- Branch name: `NNN-prNN-short-slug` (example: `001-pr03-db-foundation`). PR title:
  `[NNN PR-N] Summary`. Commits follow Conventional Commits. Merge strategy: squash.
- Target size ≤ ~400 changed lines, not counting lockfiles, generated migrations/snapshots, copied
  shadcn/ui components, fonts, message catalogs, and end-to-end spec files (`apps/web/e2e/**`). A larger PR
  MUST be split or carry a written reason in its description; exceeding the target is never a reason to
  stop work or to leave out tests.
- The PR MUST: list the task IDs it completes; tick those tasks (`[x]`) in `tasks.md`; include tests
  (principle II); update `CLAUDE.md`, `.env.example`, and docs when commands, environment variables, or
  conventions change; include Arabic and English screenshots for UI changes; contain no unrelated changes.
- The implementer MUST NOT silently deviate from the spec, plan, contracts, or data model. If they are
  wrong or incomplete, the PR description gets a **Spec deviation** section stating what and why; the
  reviewer either rejects it or the architect amends the documents (in that PR or a docs-only PR) so that
  documents and code never disagree on `main`.

**Required CI gates** (all MUST pass; none may be skipped, disabled, or marked optional to merge):

1. Formatting (`pnpm format:check`) and lint (`pnpm lint`)
2. Type check (`pnpm typecheck`)
3. i18n key parity and RTL utility check (`pnpm i18n:check`, `pnpm rtl:check`)
4. Unit + integration tests with coverage thresholds (`pnpm test`) against a real PostgreSQL
5. Production build (`pnpm build`)
6. End-to-end tests with accessibility scans and the JavaScript budget (`pnpm test:e2e`)
7. Secret scan (gitleaks) over the full PR diff
8. Dependency audit (`pnpm audit --prod --audit-level high`)

**Review**: after CI is green, the reviewer (Fable 5.2) checks the diff against the batch's tasks and
acceptance checks, the spec/plan/contracts, and every principle of this constitution, and ends with
`VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED` plus a numbered list of required changes. Requested
changes are pushed to the same PR and re-reviewed.

**Merge rule**: a pull request is squash-merged by the orchestrator (or the owner) when, and only when,
all required CI gates are green **and** the reviewer's verdict on the PR's latest commit is
`VERDICT: APPROVE`. A commit pushed after the verdict invalidates it and requires a new review. The
implementer and the reviewer never merge. The orchestrator MUST stop and ask the owner instead of merging
when a PR amends this constitution, changes `docs/roadmap.md` or a feature's `spec.md` scope, needs a
secret or an external account, or carries a Spec deviation the reviewer has not explicitly accepted.

**Definition of Done for a PR batch**: all its tasks ticked; all acceptance checks demonstrably true;
gates 1–8 green; reviewer verdict `APPROVE`; no secrets; documentation current.

**Repository protection** (configured by the owner on GitHub): `main` is protected — no direct pushes,
pull request required, required status checks = the CI jobs above, squash merge only. The reviewer's
verdict is recorded as a PR comment by the orchestrator before merging.

## Governance

- This constitution supersedes every other practice document. Order of authority:
  constitution → `docs/roadmap.md` → feature `spec.md` → `plan.md` (with research, data model, contracts)
  → `tasks.md` → `CLAUDE.md` (runtime guidance for agents; it summarises and never overrides).
- **Amendments**: made with the `speckit-constitution` skill and proposed as a pull request that changes
  only `.specify/memory/constitution.md` (plus dependent documents), with the reason and a migration plan
  for existing code and specs. An amendment requires the owner's explicit approval and takes effect when
  the owner merges it. Agents MUST NOT amend the constitution on their own initiative
  and MUST NOT weaken a gate to make a PR pass.
- **Versioning**: semantic. MAJOR — a principle or gate is removed or redefined incompatibly, or a stack
  row changes; MINOR — a principle or section is added or materially expanded; PATCH — clarification
  without change of meaning.
- **Compliance**: every plan contains a Constitution Check that confirms compliance with each principle;
  every review verifies compliance; any accepted deviation is recorded in the plan's Complexity Tracking
  table with its justification. Unjustified violations of a MUST are CRITICAL findings and block merging.
- **Consistency**: `CLAUDE.md` and the Spec Kit templates provide runtime guidance and MUST stay consistent
  with this document.
- **Periodic review**: the architect re-reads this constitution at the start of every new feature's
  planning and proposes amendments when practice and text have drifted.

**Version**: 1.2.0 | **Ratified**: 2026-11-14 | **Last Amended**: 2026-11-16
