---

description: "Task list for feature 001 — Platform Foundation, grouped into PR batches"
---

# Tasks: Platform Foundation

**Input**: Design documents from `/specs/001-platform-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all binding — see plan.md
"Implementation latitude"), quickstart.md

**Tests**: MANDATORY (constitution II). Every batch contains the tests for its own behaviour; a batch
without its tests is not done.

**Organization**: tasks are grouped by phase (Setup → Foundational → one phase per user story → Polish) and,
inside each phase, into **PR batches**. One PR batch = one branch = one pull request = one implementer
assignment. Implement batches strictly in numeric order; each starts from up-to-date `main` after the
previous batch is merged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can be done in parallel with other [P] tasks of the same batch (different files, no dependency)
- **[Story]**: `[US1]`…`[US7]` in user-story phases only
- Paths are relative to the repository root. `(FR-nnn)` = requirement covered.

## Rules for every batch

1. Branch `001-prNN-<slug>` (slug given per batch); PR title `[001 PR-N] <batch title>`.
2. Do exactly the batch's tasks; tick them `[x]` in this file in the same PR.
3. Size target ≤ ~400 changed lines, not counting `pnpm-lock.yaml`, generated migrations/snapshots, copied
   shadcn/ui files, fonts, `messages/*.json`, and end-to-end spec files (`apps/web/e2e/**`). The estimate
   per batch is a guide. If the counted diff is larger, **do not stop and do not leave out tests**: finish
   the batch and add a **Size note** to the PR description (counted lines, and why the batch cannot be
   smaller). The reviewer may instead ask for a split when the diff mixes separable concerns; the
   orchestrator then re-assigns the batch as `PR-Na` / `PR-Nb` (constitution: "split or written reason").
4. Every user-facing string goes into both `apps/web/messages/ar.json` and `en.json` (namespaces in
   contracts/routes.md §6). Every new screen is appended to the lists in `apps/web/e2e/a11y.spec.ts`.
5. "Accept" lines are the reviewer's checklist. In addition, every batch must pass `pnpm check`,
   `pnpm build`, and — from PR-10 on — `pnpm test:e2e`, and all CI jobs.
6. Never commit secrets; `.env.example` holds only the documented local values.
7. End-to-end specs run in Arabic by default; each user story's spec runs its main success scenario once
   under `/en` as well (constitution II).
8. End-to-end specs import `test` from `apps/web/e2e/support/fixtures.ts`, use their own email addresses,
   and are independent of execution order; from PR-27 on, a spec that changes college-level data does it in
   a college it created, never in `demo` (contracts/ci.md §3). Forged submissions use
   `apps/web/e2e/support/forge.ts` (contracts/server-actions.md §6). Every PR from PR-10 on states the CI
   `e2e` job's duration (contracts/ci.md §2).

## Batch overview

| Batch | Phase | Title | Est. lines |
|---|---|---|---|
| PR-1 | Setup | Workspace skeleton and tooling | 350 |
| PR-2 | Setup | CI pipeline and repository hygiene | 250 |
| PR-3 | Foundational | Database bootstrap: migrations, roles, tenants table, test harness | 400 |
| PR-4 | Foundational | Tenant context, safety checks, tenants repository | 280 |
| PR-5 | Foundational | Divisions and audit-log tables | 330 |
| PR-6 | Foundational | Rate limiter, college creation, demo seed | 300 |
| PR-7 | Foundational | i18n routing and locale layout | 380 |
| PR-8 | Foundational | Design tokens, fonts, RTL check, base UI | 350 |
| PR-9 | Foundational | Runtime plumbing: env, logging, health, start-up checks | 230 |
| PR-10 | Foundational | End-to-end, accessibility, and script-budget harness | 260 |
| PR-11 | Foundational | Email module and templates | 390 |
| PR-12 | Foundational | Auth core: auth tables, auth instance, restricted handler | 320 |
| PR-13 | Foundational | Permissions, module registry, users/sessions repositories | 300 |
| PR-14 | Foundational | Session context, guards, action plumbing | 320 |
| PR-15 | US1 | Form primitives, public shell, privacy notice | 300 |
| PR-16 | US1 | Student registration | 390 |
| PR-17 | US1 | Email confirmation and resend | 300 |
| PR-18 | US1 | Sign-in, sign-out, first dashboard | 390 |
| PR-19 | US1 | App shell navigation and module placeholders | 390 |
| PR-20 | US1 | Language preference | 160 |
| PR-21 | US2 | Student profile data layer | 300 |
| PR-22 | US2 | Profile-completion step | 350 |
| PR-23 | US2 | Profile screen | 300 |
| PR-24 | US3 | Password recovery | 350 |
| PR-25 | US4 | Invitations data layer | 380 |
| PR-26 | US4 | Operator tools: create and suspend colleges | 300 |
| PR-27 | US4 | Accept invitation and college isolation | 400 |
| PR-28 | US5 | Invite staff: create and list | 380 |
| PR-29 | US5 | Revoke invitations; registration with a pending invitation | 220 |
| PR-30 | US5 | Role-based access matrix | 260 |
| PR-31 | US6 | People data layer | 350 |
| PR-32 | US6 | People list screen | 380 |
| PR-33 | US6 | Role change and suspension | 380 |
| PR-34 | US6 | Correct a student's academic data | 250 |
| PR-35 | US7 | College settings and module switches | 390 |
| PR-36 | US7 | Divisions management | 380 |
| PR-37 | Polish | Browser protections | 200 |
| PR-38 | Polish | Final sweep and documentation | 250 |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a buildable, lintable, testable empty workspace with CI.

### PR-1 — Workspace skeleton and tooling · branch `001-pr01-workspace`

- [x] T001 Create root workspace files `package.json` (private, `packageManager` pnpm 10, `engines.node >=22`, all root scripts from contracts/cli.md §1 that can exist now: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `check`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (`24`), `.npmrc`, `.editorconfig`, `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`); fill the "Exact version" column of `specs/001-platform-foundation/research.md` §24 for every package installed in this batch
- [x] T002 Scaffold `@masari/web` in `apps/web/`: `package.json`, `next.config.ts` (`transpilePackages: ['@masari/db']`, `poweredByHeader: false`), `tsconfig.json` (extends base, alias `@/*` → `src/*`), `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx` (temporary page showing only the text "Masari"), `src/app/globals.css` (Tailwind 4 import only)
- [x] T003 Scaffold `@masari/db` in `packages/db/`: `package.json` (`exports`: `.` → `./src/index.ts`, `./auth` → `./src/auth.ts`, `./admin` → `./src/admin.ts`; scripts `typecheck`, `test`), `tsconfig.json`, `vitest.config.ts`, `src/constants.ts` (exactly the constants and types in data-model.md "Conventions"), `src/index.ts` (re-exports constants), `src/constants.test.ts` (asserts the six module keys and four roles, in order)
- [x] T004 [P] Create `eslint.config.mjs` (flat): typescript-eslint type-checked rules, eslint-config-next for `apps/web`, `no-console` (allowed only in `apps/web/src/server/log.ts` and `packages/db/scripts/**`), `no-restricted-imports` for the layer rules in plan.md "Structure Decision" (`pg`, `drizzle-orm` forbidden in `apps/web/src/**`; `@masari/db/admin` forbidden in `apps/web/src/**`; `@masari/db/auth` only in `apps/web/src/server/auth/auth.ts`), ban on `process.env` outside the files listed in contracts/http-and-env.md §3, ban on `.only` in tests
- [x] T005 [P] Create `.prettierrc.json` (with `prettier-plugin-tailwindcss`) and `.prettierignore` (lockfile, `.next`, `coverage`, `packages/db/migrations`, `.specify`, `.claude`, `docs/*.html`, `docs/*.pdf`)
- [x] T006 Create `apps/web/vitest.config.ts` (node environment, v8 coverage, alias `@`), `apps/web/src/lib/result.ts` (types `ErrorCode`, `FieldErrorCode`, `ActionResult`, helpers `ok`, `fail` exactly as contracts/server-actions.md §1) and `apps/web/src/lib/result.test.ts`
- [x] T007 [P] Create `README.md` (what Masari is, links to constitution, roadmap, feature 001 quickstart; no setup duplication)

**Accept**: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build` succeed on a clean clone · `pnpm dev` serves `/` with status 200 · importing `pg` from a file in `apps/web/src` makes `pnpm lint` fail (state how verified in the PR) · no file outside this batch's list is added

### PR-2 — CI pipeline and repository hygiene · branch `001-pr02-ci`

- [x] T008 Create `.github/workflows/ci.yml` with jobs `quality`, `test`, `build`, `secrets`, `audit` exactly as contracts/ci.md §1–2 (PostgreSQL service and job environment already declared for `test`; the `e2e` job comes in PR-10) (FR-046)
- [x] T009 [P] Create `.gitleaks.toml` per contracts/ci.md §6
- [x] T010 [P] Create `.github/pull_request_template.md` with the sections in contracts/ci.md §6
- [x] T011 [P] Create `.github/dependabot.yml` per contracts/ci.md §6
- [x] T012 [P] Create `docs/repo-settings.md` (owner checklist per contracts/ci.md §6: required checks `quality`, `test`, `build`, `secrets`, `audit` now; `e2e` to be added as required **only after PR-10 is merged**; what to do when `audit` fails on an upstream advisory — contracts/ci.md §2)

**Accept**: all five jobs run and pass on this PR · `build` job has no application env vars · workflow has `permissions: contents: read`, concurrency cancel, 15-minute timeouts · no `continue-on-error`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: database with tenant isolation, i18n/RTL base, runtime plumbing, test harnesses, email, auth,
permissions. **No user-story batch may start before PR-14 is merged.**

### PR-3 — Database bootstrap: migrations, roles, tenants table, test harness · branch `001-pr03-db-bootstrap`

- [x] T013 Create `docker-compose.yml` (service `postgres`: `postgres:16-alpine`, owner `masari_owner`/`masari_dev_owner`, database `masari`, port published as `127.0.0.1:5432:5432` — loopback only, because the owner password is a documented development value — named volume, healthcheck) and `.env.example` (every variable of contracts/http-and-env.md §3 with the documented local values); add root scripts `db:up`, `db:down`, `db:generate`, `db:migrate` and `dotenv-cli` loading of the root `.env` (contracts/cli.md) (FR-047)
- [x] T014 Create `packages/db/src/env.ts` (`getDbEnv`, `getAdminDbEnv`; lazy Zod parsing) with `packages/db/src/env.test.ts`, and `packages/db/src/client.ts` (lazy `pg` Pool on `DATABASE_URL`, Drizzle instance, `closePool`)
- [x] T015 Create `packages/db/drizzle.config.ts`; a custom SQL migration named `bootstrap` in `packages/db/migrations/` (role `masari_app`, function `app_tenant_id()` — data-model.md §2); `packages/db/src/schema/tenants.ts` + `packages/db/src/schema/index.ts` with every column and CHECK of data-model.md §3.1; the generated migration for `tenants`; a custom SQL migration named `tenants_security` (RLS enable, policies `tenants_select`/`tenants_update`, column-level grants of data-model.md §1) (FR-017)
- [x] T016 Create `packages/db/src/admin/migrate.ts` (`runMigrations`, `ensureRuntimeRole`), `packages/db/src/admin/database.ts` (`withDatabaseName`, `recreateDatabase` with the name guard), `packages/db/src/admin.ts` (entry point re-exporting them), `packages/db/scripts/migrate.ts` (behaviour and output of contracts/cli.md §2), unit test `packages/db/src/admin/database.test.ts` for `withDatabaseName`, the name guard, and the identifier/literal escaping rule of contracts/db-api.md §3 (a role or database name outside the allowed pattern throws before any SQL is sent)
- [x] T017 Create `packages/db/src/table-classification.ts` (entry for `tenants`), `packages/db/test/global-setup.ts` (recreate `masari_test`), `packages/db/test/helpers.ts` (owner-connection fixtures: `makeTenant()` with random slug; runtime-role query helper), update `packages/db/vitest.config.ts` (globalSetup, worker env via `withDatabaseName`, coverage thresholds of contracts/ci.md §4), and `packages/db/test/rls-meta.int.test.ts` (all assertions listed for it in contracts/db-api.md §4)

**Accept**: `pnpm db:up && pnpm db:migrate` on an empty database prints both success lines and is idempotent on a second run · the runtime role exists with `NOSUPERUSER NOBYPASSRLS` and membership of `masari_app` · `pnpm test` recreates `masari_test` without touching `masari` · no password appears in any migration file · CI `test` job green using the service container

### PR-4 — Tenant context, safety checks, tenants repository · branch `001-pr04-tenant-context`

- [x] T018 Create `packages/db/src/context.ts` (`Tx`, `withTenant`; uuid validation; transaction-local `set_config` of `app.tenant_id` and `app.user_id`) and export from `packages/db/src/index.ts` (FR-017)
- [x] T019 [P] Create `packages/db/src/safety.ts` (`ping`, `assertSafeRuntimeRole`) and export from `packages/db/src/index.ts`
- [x] T020 Create `packages/db/src/repositories/tenants.ts` (`listActivePublic`, `findBySlug`, `findById`, `updateSettings` — contracts/db-api.md §1.6) and export namespace `tenants` (FR-002, FR-032)
- [x] T021 Create `packages/db/test/context.int.test.ts`, `packages/db/test/safety.int.test.ts`, `packages/db/test/tenants.int.test.ts` covering every statement listed for them in contracts/db-api.md §4

**Accept**: a query issued on the same pooled connection after `withTenant` returns sees an empty `app.tenant_id` · `assertSafeRuntimeRole()` throws when connected as the owner · runtime role cannot `INSERT`/`DELETE` on `tenants` nor update `slug`/`status` (tests) · `updateSettings` for college A leaves college B unchanged (test)

### PR-5 — Divisions and audit-log tables · branch `001-pr05-divisions-audit`

- [x] T022 Create `packages/db/src/schema/divisions.ts` and `packages/db/src/schema/audit-events.ts` (data-model.md §3.5, §3.8: `tenant_id uuid NOT NULL DEFAULT app_tenant_id()`, `UNIQUE (tenant_id, code)`, `UNIQUE (tenant_id, id)`, `CHECK (code ~ '^[A-Z0-9_-]{1,16}$')`, name lengths 1–80, `sort_order BETWEEN 0 AND 9999`, `char_length(action) <= 64`, index `audit_events_tenant_created_idx`; `actor_user_id text NULL` **without a foreign key** — `users` does not exist yet, T052 adds it), generated migration, and a custom SQL migration `divisions_audit_security` (RLS enabled + forced, policy `tenant_isolation`, grants: divisions `SELECT, INSERT, UPDATE`; audit_events `SELECT, INSERT`); add both to `packages/db/src/table-classification.ts`
- [x] T023 Create `packages/db/src/repositories/divisions.ts` (`list`, `findById`, `create` → `code_taken`, `update`, `setActive`) and `packages/db/src/repositories/audit.ts` (`record`); export namespaces `divisions`, `audit` (FR-033, FR-044)
- [x] T024 Create `packages/db/test/divisions.int.test.ts` and `packages/db/test/audit.int.test.ts` covering every statement listed for them in contracts/db-api.md §4

**Accept**: rls-meta test passes with the two new tables · college A cannot read or update a college-B division by id · `UPDATE`/`DELETE` on `audit_events` as the runtime role fails with a permission error · duplicate division code in one college returns `code_taken`, same code in two colleges succeeds

### PR-6 — Rate limiter, college creation, demo seed · branch `001-pr06-ratelimit-seed`

- [x] T025 Create `packages/db/src/schema/rate-limit-counters.ts` (data-model.md §3.4), generated migration, custom SQL migration `rate_limit_security` (grants `SELECT, INSERT, UPDATE, DELETE`), classification entry (global), `packages/db/src/rate-limit.ts` (`hitRateLimit`, single atomic statement; `purgeExpiredRateLimits` and the 1-in-100 opportunistic purge of contracts/db-api.md §1.4) exported from `packages/db/src/index.ts`, and `packages/db/test/rate-limit.int.test.ts` (contracts/db-api.md §4) (FR-009)
- [x] T026 Create `packages/db/src/admin/tenants.ts` with `createTenant` (default settings + division `GEN` «عام»/"General" in one transaction; `slug_taken`) and `packages/db/src/admin/seed.ts` with `seedDemo` (data-model.md §5; idempotent; `adminInvitationToken: null` for now); export both from `packages/db/src/admin.ts` (FR-018, FR-047)
- [x] T027 Create `packages/db/scripts/seed.ts` (contracts/cli.md §3; refuses when `APP_ENV=production`) and root script `db:seed`; create `packages/db/test/admin.int.test.ts` for `createTenant` (defaults, `GEN` division, duplicate slug) and `seedDemo` idempotency

**Accept**: 20 concurrent `hitRateLimit` calls with limit 10 → exactly 10 allowed · refused result has `retryAfterSeconds > 0` · window reset works (1 s window) · `pnpm db:seed` twice → one `demo` college, five divisions · `hitRateLimit` rejects keys longer than 200 characters (hashing of emails/IPs into keys is added in PR-14)

### PR-7 — i18n routing and locale layout · branch `001-pr07-i18n`

- [x] T028 Create `apps/web/src/i18n/routing.ts` (locales `ar`,`en`; default `ar`; `localePrefix: 'always'`; `localeDetection: false`), `apps/web/src/i18n/request.ts`, `apps/web/src/i18n/navigation.ts`, `apps/web/src/i18n/types.d.ts` (typed messages), `apps/web/src/proxy.ts` (locale routing only; matcher excludes `/api`, `/_next`, files), and wire the next-intl plugin in `apps/web/next.config.ts` (FR-036)
- [x] T029 Create `apps/web/messages/ar.json` and `apps/web/messages/en.json` with namespaces `common` (app name, language names, roles, statuses, levels 1–7, generic actions), `errors` (one key per `ErrorCode` and `FieldErrorCode`), `meta`; Arabic written natively with the fixed terms of contracts/routes.md §6
- [x] T030 Replace `apps/web/src/app/layout.tsx` and `apps/web/src/app/page.tsx` with `apps/web/src/app/[locale]/layout.tsx` (`<html lang dir>`, locale validation → `notFound()`, `NextIntlClientProvider`, metadata with `robots: noindex`), `apps/web/src/app/[locale]/page.tsx` (temporary: `<h1>` app name + language switch), `apps/web/src/app/[locale]/not-found.tsx`, `apps/web/src/app/[locale]/error.tsx`, `apps/web/src/app/not-found.tsx` (contracts/routes.md §1, §5) (FR-036, FR-049)
- [x] T031 [P] Create `apps/web/src/lib/locale.ts` (`dirOf(locale)`, `isLocale`) and `apps/web/src/lib/format.ts` (`formatDate`, `formatDateTime`, `formatNumber`: Western digits, Gregorian, `Africa/Cairo`) with `apps/web/src/lib/locale.test.ts` and `apps/web/src/lib/format.test.ts` (asserts no Arabic-Indic digits in `ar` output) (FR-041)
- [x] T032 [P] Create `apps/web/src/components/shell/locale-switcher.tsx` (link to the same path + query in the other locale; accessible name in the target language; `lang` attribute on the label)
- [x] T033 Create `scripts/check-i18n.mjs` (contracts/cli.md §1), root script `i18n:check`, add it to `check` and to the `quality` job in `.github/workflows/ci.yml`; enable ESLint `react/jsx-no-literals` for `apps/web/src/**/*.tsx` (tests and `components/ui` excluded) in `eslint.config.mjs`

**Accept**: `/` → 307/308 to `/ar` regardless of `Accept-Language` · `/ar` has `<html lang="ar" dir="rtl">`, `/en` has `lang="en" dir="ltr"` · `/fr` → 404 · removing a key from `en.json` makes `pnpm i18n:check` exit 1 naming the key · a literal string in a TSX component fails lint · `formatNumber(1234.5,'ar')` contains only Western digits

### PR-8 — Design tokens, fonts, RTL check, base UI · branch `001-pr08-design-base`

- [x] T034 Create `PRODUCT.md` and `DESIGN.md` at the repository root per research.md §22 (users and tone; "Operate" mode; colour roles, type scale, spacing, radii, focus ring; Arabic typography and RTL rules) — follow the Impeccable skill, light theme only
- [x] T035 Implement the tokens in `apps/web/src/app/globals.css` (Tailwind 4 `@theme`; focus ring; `prefers-reduced-motion`; Arabic body line-height 1.7; no letter-spacing on Arabic) and load IBM Plex Sans Arabic 400/500/600/700 from `@fontsource/ibm-plex-sans-arabic` in `apps/web/src/app/[locale]/layout.tsx` with a system fallback stack
- [x] T036 Initialise shadcn/ui: `apps/web/components.json`, `apps/web/src/lib/utils.ts` (`cn`), `apps/web/src/components/ui/button.tsx` (logical utilities only)
- [x] T037 [P] Create `apps/web/src/components/shell/skip-link.tsx` and `apps/web/src/components/shell/public-header.tsx` (wordmark = `common.appName`: «مساري» / "Masari", `locale-switcher`), and use both on `apps/web/src/app/[locale]/page.tsx` with a `<main id="main">`
- [x] T038 Create `scripts/check-rtl.mjs` (patterns, exemption marker, and output format of contracts/cli.md §1), root script `rtl:check`, add it to `check` and to the `quality` job in `.github/workflows/ci.yml`

**Accept**: adding `ml-2` to any file in `apps/web/src` makes `pnpm rtl:check` exit 1 with `file:line` and the logical equivalent · every text/background token pair listed in `DESIGN.md` states its contrast ratio ≥ 4.5:1 (≥ 3:1 for large text/UI) · no network request to a font CDN (fonts served from the app) · skip link is the first focusable element and moves focus to `main` · PR includes ar + en screenshots of the temporary home page

### PR-9 — Runtime plumbing: env, logging, health, start-up checks · branch `001-pr09-runtime`

- [x] T039 Create `apps/web/src/server/env.ts` (`getEnv()`: lazy, memoised, every rule of contracts/http-and-env.md §3 including the production rules; error lists variable names only) with `apps/web/src/server/env.test.ts`
- [x] T040 [P] Create `apps/web/src/server/log.ts` (contracts/http-and-env.md §4) with `apps/web/src/server/log.test.ts`
- [x] T041 Create `apps/web/src/app/api/health/route.ts` (contracts/http-and-env.md §1.1) and `apps/web/src/instrumentation.ts` (`register()`: only when `NEXT_RUNTIME === 'nodejs'` and not during `next build` — guard of contracts/http-and-env.md §3 — `getEnv()` then `assertSafeRuntimeRole()`; on failure log one `startup.failed` line and exit non-zero; state in the PR whether the pinned Next.js calls `register()` in build workers) (FR-045)
- [x] T042 Turn on the coverage thresholds for `@masari/web` in `apps/web/vitest.config.ts` (include/exclude lists of contracts/ci.md §4); add scripts `dev`/`start` wrappers that load the root `.env` via `dotenv-cli` in `apps/web/package.json`

**Accept**: `pnpm build` succeeds with an empty environment · `pnpm dev` with a valid `.env` starts; with `BETTER_AUTH_SECRET` shorter than 32 chars it exits naming `BETTER_AUTH_SECRET` and not its value · with `DATABASE_URL` set to the owner URL it exits with the RLS-bypass message · `GET /api/health` → 200 `{"status":"ok"}` with `Cache-Control: no-store`; with PostgreSQL stopped → 503 `{"status":"unavailable"}` · `APP_ENV=production` + `EMAIL_TRANSPORT=capture` is rejected, `TRUSTED_PROXY_HOPS` defaults to 0 and `APP_ENV=production` requires it ≥ 1 (unit tests)

### PR-10 — End-to-end, accessibility, and script-budget harness · branch `001-pr10-e2e-harness`

- [x] T043 Create `apps/web/e2e/support/prepare-db.ts` (`recreateDatabase` of `masari_e2e` + `seedDemo`; run with `tsx` **before** Playwright starts, because Playwright launches `webServer` before `globalSetup` and the server exits without its database), `apps/web/playwright.config.ts` (projects `desktop` and `mobile`, `webServer` on port 3100 with the env of contracts/ci.md §3 including `TRUSTED_PROXY_HOPS=1`, `workers: 2` on CI), `apps/web/e2e/support/global-setup.ts` (empties the capture directory only), and `apps/web/e2e/support/fixtures.ts` (the `test` object every spec imports: per-test `x-forwarded-for` address — contracts/http-and-env.md §5); add scripts `test:e2e` (`next build` → `prepare-db` → `playwright test`) in `apps/web/package.json` and at the root
- [x] T044 [P] Create `apps/web/e2e/support/axe.ts` (`expectNoA11yViolations`) and `apps/web/e2e/a11y.spec.ts` (lists `PUBLIC_SCREENS` = [`/`], `SIGNED_IN_SCREENS` = []; scans each in `ar` and `en`) (FR-042)
- [x] T045 [P] Create `apps/web/e2e/locale.spec.ts` (redirect `/` → `/ar` with an English `Accept-Language`; `lang`/`dir` per locale; switcher keeps path and query; `/fr` → 404; `@mobile`: no horizontal scroll at 320 px) (FR-036)
- [x] T046 [P] Create `apps/web/e2e/perf-budget.spec.ts` (script bytes via DevTools protocol; budget table `{ path, limitKB }` starting with `/ar` ≤ 200) (FR-043)
- [x] T047 Add the `e2e` job to `.github/workflows/ci.yml` (contracts/ci.md §2) and a health check spec `apps/web/e2e/health.spec.ts` (`GET /api/health` → 200 body)

**Accept**: `pnpm test:e2e` on a server where database `masari_e2e` does not exist yet builds, creates it, starts on 3100, and passes locally or in CI · two tests send different `x-forwarded-for` addresses inside `198.18.0.0/15`, and a retry of a test sends another (state how verified) · CI `e2e` job is green and uploads the report only on failure · an injected contrast violation makes `a11y.spec.ts` fail (state how verified) · the script-budget test prints the measured KB per path

### PR-11 — Email module and templates · branch `001-pr11-email`

- [x] T048 Create `apps/web/src/server/email/transport.ts` (`smtp` and `capture` transports; capture file format and the development-only link printing of contracts/emails.md §1, with a test that nothing is printed when `APP_ENV=test`) and `apps/web/src/server/email/send.ts` (`sendEmail`, `EmailMessage` with its `template` name, `EmailTemplateName`)
- [x] T049 Create `apps/web/src/server/email/templates/layout.ts` (bilingual frame, HTML escaping helper, button + visible URL) with `apps/web/src/server/email/templates/layout.test.ts` (FR-038)
- [x] T050 [P] Create `apps/web/src/server/email/templates/verify-email.ts`, `account-exists.ts`, `invitation-pending.ts`, `reset-password.ts`, `invitation.ts` in the same folder, with subjects/inputs/content of contracts/emails.md §3, and one test file `apps/web/src/server/email/templates/templates.test.ts` applying the four checks of contracts/emails.md §2 to all five
- [x] T051 Create `apps/web/e2e/support/emails.ts` (`waitForEmail`, `firstLink`, `countEmails` — contracts/emails.md §4)

**Accept**: every template's `html` has the Arabic `dir="rtl"` block before the English `dir="ltr"` block and `text` has Arabic first · `<script>` in any input is escaped · subjects are `"<Arabic> | <English>"` · `invitation-pending` contains no URL · capture mode writes one JSON file per message under `apps/web/.tmp/emails/` and logs only the template name · no email address appears in logs (test)

### PR-12 — Auth core: auth tables, auth instance, restricted handler · branch `001-pr12-auth-core`

- [x] T052 Create `packages/db/src/schema/auth.ts` (tables `users`, `sessions`, `accounts`, `verifications` generated for the pinned Better Auth version, plus the Masari columns and constraints of data-model.md §3.2–3.3: `tenant_id` FK RESTRICT, `role` default `'student'` + CHECK, `status` default `'active'` + CHECK, `locale` default `'ar'` + CHECK, `privacy_consent_at`, `CHECK (email = lower(email))`, `CHECK (char_length(name) BETWEEN 2 AND 100)`, indexes), generated migration, custom SQL migration `auth_security` (grants), classification entries (global), and `packages/db/src/auth.ts` (`getAuthDb()` lazy getter, `authSchema` — contracts/db-api.md §2); in the same batch add the foreign key `audit_events.actor_user_id → users(id) ON DELETE SET NULL` (data-model.md §3.8: reference in `packages/db/src/schema/audit-events.ts` + generated migration) (FR-012, FR-044)
- [x] T053 Create `packages/db/test/auth-schema.int.test.ts` (defaults `student`/`active`/`ar`; upper-case email rejected; unknown role rejected; user without tenant rejected; deleting a user cascades to sessions/accounts and sets `audit_events.actor_user_id` to NULL) and extend `packages/db/test/audit.int.test.ts` (a real user as actor is stored; an unknown actor id is rejected by the foreign key)
- [x] T054 Create `apps/web/src/server/auth/auth.ts`: lazy, memoised `getAuth()` — no auth instance, connection, or environment read at module scope (contracts/http-and-env.md §3) — returning the Better Auth instance with every setting of research.md §7 (Drizzle adapter plural tables; email+password; password 10–128; `requireEmailVerification`; no send-on-sign-up; no auto sign-in after verification; verification 24 h; reset 1 h; revoke sessions on reset; session 7 days / refresh daily; no cookie cache; additional fields with `role`/`status` not settable; `sendVerificationEmail` → `verify-email` template; `sendResetPassword` → `reset-password` template; `nextCookies()` last; `baseURL`/`trustedOrigins` from `APP_URL`) (FR-004, FR-007, FR-008, FR-010)
- [x] T055 Create `apps/web/src/server/auth/allowed-paths.ts` (`isAllowedAuthRequest`) with `apps/web/src/server/auth/allowed-paths.test.ts`, `apps/web/src/app/api/auth/[...all]/route.ts` (404 unless allowed), and `apps/web/e2e/auth-endpoints.spec.ts` (`POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `GET /api/auth/get-session` → 404) (contracts/http-and-env.md §1.2) (FR-013)

**Accept**: allow-list unit test covers allowed paths, other methods on allowed paths, trailing slashes, encoded and `..` paths · the three e2e requests return 404 · `pnpm build` still succeeds with an empty environment · the migration adding the `audit_events` actor foreign key applies on a database that already has audit rows with `NULL` actors · rls-meta test passes with the four auth tables classified global · `@masari/db/auth` is imported only by `server/auth/auth.ts` (lint) · any difference between research.md §7 option names and the pinned library is listed under Spec deviation

### PR-13 — Permissions, module registry, users/sessions repositories · branch `001-pr13-permissions`

- [x] T056 Create `apps/web/src/modules/registry.ts` (`MODULE_REGISTRY`, `visibleModules`) with `apps/web/src/modules/registry.test.ts` (every role × all-enabled and × one-disabled; order = `MODULE_KEYS`) (FR-016, FR-034, FR-035)
- [x] T057 Create `apps/web/src/server/auth/permissions.ts` (`PERMISSIONS`, `Permission`, `can`; `module.*` derived from the registry) with `apps/web/src/server/auth/permissions.test.ts` asserting all 40 cells (10 permissions × 4 roles) of contracts/permissions.md §2 (FR-014)
- [x] T058 Create `packages/db/src/repositories/users.ts` (`findByEmail`, `findById`; type `UserSummary` — never returns hashes) and `packages/db/src/repositories/sessions.ts` (`revokeAllForUser`); export namespaces `users`, `sessions`; create `packages/db/test/users.int.test.ts` (lookup, lower-case match) and `packages/db/test/sessions.int.test.ts` (contracts/db-api.md §4)

**Accept**: permission test is table-driven with exactly 40 assertions, every permission has at least one granted and one denied role, and it fails if a row is added to `PERMISSIONS` without a matrix entry · `can()` returns false for an unknown permission string · `revokeAllForUser` deletes only that user's sessions

### PR-14 — Session context, guards, action plumbing · branch `001-pr14-session-guards`

- [x] T059 Create `apps/web/src/server/auth/session.ts` (`SessionContext` without `studentProfile` for now, `getSessionContext` cached per request with fresh user + college status checks, `getSessionDenialReason`, `requireSession`, `requirePermission`) per contracts/permissions.md §3 (FR-008, FR-014, FR-015, FR-019)
- [x] T060 Create `apps/web/src/server/auth/action-context.ts` (`getActionContext`), `apps/web/src/server/request.ts` (`getClientIp()` and the pure `clientIpFromHeader(value, hops)` — trusted-proxy rule of contracts/http-and-env.md §5, never the first `x-forwarded-for` entry) with `apps/web/src/server/request.test.ts` (the table listed there; `TRUSTED_PROXY_HOPS` is already parsed by `env.ts` since PR-9), `apps/web/src/server/audit.ts` (`recordAudit(ctx | { tenantId, userId }, event, tx?)`: with `tx` → `audit.record(tx, …)` in the caller's transaction; without → its own `withTenant`; adds the IP or `NULL` — contracts/server-actions.md §1)
- [x] T061 Create `apps/web/src/server/rate-limit.ts` (`RATE_LIMITS` table and `enforceRateLimit` of contracts/server-actions.md §2; keys `"<purpose>:<kind>:<sha256 hex>"`) with `apps/web/src/server/rate-limit.test.ts` (key format contains no raw value; policy numbers equal FR-009) (FR-009)
- [x] T062 Create `apps/web/src/lib/safe-next.ts` (`safeNext`) with `apps/web/src/lib/safe-next.test.ts` (accepts `/dashboard?x=1`; rejects `//evil`, `/\evil`, `https://evil`, `javascript:`, >512 chars) and `apps/web/src/app/guard-coverage.test.ts` (scan of contracts/permissions.md §3)

**Accept**: guard-coverage test fails when a `page.tsx` without a guard call is added under `[locale]/(app)` (state how verified) · rate-limit policy test pins every number in contracts/server-actions.md §2 · `audit.ts` cannot be called with free-text metadata values longer than 64 chars (type or runtime check + test)

**Checkpoint**: foundation ready — user-story batches may begin.

---

## Phase 3: User Story 1 — A student joins their college and reaches an Arabic home screen (Priority: P1) 🎯 MVP

**Goal**: register → confirm email → sign in → Arabic RTL home with module placeholders → switch language → sign out.

**Independent Test**: quickstart.md V1.

### PR-15 — Form primitives, public shell, privacy notice · branch `001-pr15-public-shell`

- [x] T063 [P] [US1] Add shadcn/ui `input`, `label`, `checkbox`, `select`, `alert`, `card` to `apps/web/src/components/ui/` (logical utilities only)
- [x] T064 [US1] Create `apps/web/src/components/forms/field.tsx` (label + control slot + hint + error wired with `aria-invalid`/`aria-describedby`), `apps/web/src/components/forms/form-error.tsx` (`role="alert"` summary translating `ErrorCode`, shows retry time for `rate_limited`), `apps/web/src/components/forms/submit-button.tsx` (pending state via `useFormStatus`) (FR-042)
- [x] T065 [US1] Create `apps/web/src/app/[locale]/(public)/layout.tsx` (skip link, `public-header`, `<main id="main">`, footer link to the privacy notice) and `apps/web/src/app/[locale]/(public)/privacy/page.tsx` with the notice text in the `privacy` namespace of both catalogs covering the four points of FR-011; add `/privacy` to `PUBLIC_SCREENS` in `apps/web/e2e/a11y.spec.ts` (FR-011)

**Accept**: `/ar/privacy` and `/en/privacy` pass axe · `Field` wires `aria-invalid` and `aria-describedby` (asserted end-to-end in PR-16, where it is first used) · PR description flags the privacy text as a draft for owner review (spec D17)

### PR-16 — Student registration · branch `001-pr16-registration`

- [x] T066 [US1] Create `apps/web/src/features/auth/schemas.ts` (`registerSchema`: `tenantSlug`, `name`, `email`, `password` new, `consent` — rules of contracts/server-actions.md §3) and `apps/web/src/features/auth/rules.ts` (`normalizeEmail`, `emailDomain`, `isEmailDomainAllowed(email, domains)`) with `schemas.test.ts` and `rules.test.ts` in the same folder (every field error code; empty domain list allows all; case-insensitive domain match; sub-domain is not a match) (FR-001, FR-003, FR-007)
- [x] T067 [US1] Create `apps/web/src/features/auth/actions.ts` with `registerStudentAction` implementing steps 1–5 and 7–9 of contracts/server-actions.md §4.1 (step 6, pending invitation, is added in PR-29) (FR-001–FR-005, FR-009, FR-011, FR-013)
- [x] T068 [US1] Create `apps/web/src/app/[locale]/(public)/register/page.tsx` (college preselected by `?u=` or when one active college; signed-in users redirected) and `apps/web/src/features/auth/components/register-form.tsx` (`useActionState`; `autocomplete`; `dir="ltr"` on email/password; consent checkbox linking to `/privacy`; domain error names the accepted domains) (FR-002)
- [x] T069 [US1] Create `apps/web/src/app/[locale]/(public)/verify-email/page.tsx` ("check your email" text only; resend form arrives in PR-17)
- [x] T070 [US1] Create `packages/db/src/admin/test-support.ts` (`getUserByEmail`, `countAuditEvents` — contracts/db-api.md §3; exported from `packages/db/src/admin.ts`), `apps/web/e2e/support/db.ts` (thin wrappers bound to the `masari_e2e` owner URL), `apps/web/e2e/support/flows.ts` (`uniqueEmail()`, `registerStudent(page, {...})`) and `apps/web/e2e/register.spec.ts`: success → `/ar/verify-email` + one captured `verify-email` message; each validation error shown on its field; registering an existing email → same screen, one `account-exists` message, still one user; unknown `?u=` slug → picker shown; `@mobile` layout; add `/register`, `/verify-email` to `PUBLIC_SCREENS`

**Accept**: US1 acceptance scenarios 1, 7 pass in e2e · response for a new and an existing email is the same redirect (asserted) · a form submitted with JavaScript disabled still shows field errors (one e2e test with `javaScriptEnabled: false`) · after registration `getUserByEmail` shows role `student`, `emailVerified=false`, `privacyConsentAt` set, `locale` = page locale, and one `user.registered` audit row exists · field errors are linked with `aria-describedby` and `aria-invalid` (asserted)

### PR-17 — Email confirmation and resend · branch `001-pr17-email-confirmation`

- [x] T071 [US1] Add `resendVerificationAction` to `apps/web/src/features/auth/actions.ts` and `resendSchema` to `apps/web/src/features/auth/schemas.ts` (+ test) (contracts/server-actions.md §4.2) (FR-004, FR-005, FR-009)
- [x] T072 [US1] Create `apps/web/src/features/auth/components/resend-verification-form.tsx`; use it on `apps/web/src/app/[locale]/(public)/verify-email/page.tsx`
- [x] T073 [US1] Create `apps/web/src/app/[locale]/(public)/email-verified/page.tsx` (no `error` param → success + link to sign-in; `error` present → invalid/expired text + resend form; never signs the user in) (FR-004)
- [x] T074 [US1] Extend `apps/web/e2e/support/flows.ts` (`confirmEmail(page, email)`) and create `apps/web/e2e/email-confirmation.spec.ts`: link → success screen, not signed in; same link opened twice → success both times; tampered token → invalid screen; resend for an unconfirmed account → new message; resend for an unknown email → same confirmation text and zero messages; 4th resend within an hour → `rate_limited` message; add `/email-verified` to `PUBLIC_SCREENS`

**Accept**: US1 acceptance scenario 2 passes · resend never reveals whether the email exists (same text asserted for both cases) · rate-limit message shows a retry time

### PR-18 — Sign-in, sign-out, first dashboard · branch `001-pr18-sign-in`

- [x] T075 [US1] Add `signInSchema` (+ test) to `apps/web/src/features/auth/schemas.ts` and `signInAction`, `signOutAction` to `apps/web/src/features/auth/actions.ts` (contracts/server-actions.md §4.3–4.4, including the suspended-user/college post-check and audit) (FR-006, FR-008, FR-009, FR-019, FR-044)
- [x] T076 [US1] Create `apps/web/src/app/[locale]/(public)/sign-in/page.tsx` (banners for `reason`, `reset`, `invited`; hidden `next`; links to register and forgot-password; signed-in users redirected) and `apps/web/src/features/auth/components/sign-in-form.tsx` (shows resend form on `email_not_verified`)
- [x] T077 [US1] Create `apps/web/src/app/[locale]/(app)/layout.tsx` (minimal: skip link, header with college name, language switch, sign-out form button, `<main id="main">`) and `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` (`requireSession('/dashboard')`; greeting with name + college name); replace `apps/web/src/app/[locale]/page.tsx` with the redirect of contracts/routes.md §2; make `apps/web/src/app/guard-coverage.test.ts` require at least one scanned page (FR-039, FR-040)
- [x] T078 [US1] Extend `apps/web/e2e/support/flows.ts` (`signIn`, `signOut`, `registerConfirmedStudent`) and create `apps/web/e2e/auth.spec.ts`: full journey to `/ar/dashboard`; wrong password and unknown email show the identical generic message; unconfirmed account with correct password → `email_not_verified` + resend; signed-out `/ar/dashboard` → `/ar/sign-in?next=%2Fdashboard` → back after sign-in; `next=//evil.test` ignored; sign-out then browser back does not show the dashboard; 11th attempt for one email within 10 min → `rate_limited`; one `auth.sign_in` audit row per sign-in (`countAuditEvents` in `e2e/support/db.ts`); replace `/` (now a redirect) with `/sign-in` in `PUBLIC_SCREENS` and in the script budget (200 KB), add `/dashboard` to `SIGNED_IN_SCREENS` and `/ar/dashboard` (300 KB) to the budget

**Accept**: US1 acceptance scenarios 3, 5, 6, 9, 10 pass · session cookie is `HttpOnly` and `SameSite=Lax` (asserted in e2e) · sign-in works with JavaScript disabled

### PR-19 — App shell navigation and module placeholders · branch `001-pr19-app-shell`

- [ ] T079 [P] [US1] Add shadcn/ui `dropdown-menu`, `sheet`, `badge` to `apps/web/src/components/ui/`
- [ ] T080 [US1] Create `apps/web/src/components/shell/nav-items.ts` (`buildNavItems(ctx)`: Home, `visibleModules`, admin section by permission — contracts/routes.md §4; admin items list starts empty and grows in later batches) with `apps/web/src/components/shell/nav-items.test.ts` (FR-016)
- [ ] T081 [US1] Create `apps/web/src/components/shell/app-header.tsx`, `app-sidebar.tsx`, `mobile-nav.tsx` (drawer; focus trap; Escape closes; focus returns), `user-menu.tsx` (name, role label, Profile link, sign-out) and use them in `apps/web/src/app/[locale]/(app)/layout.tsx`; `aria-current="page"` on the active entry; directional icons mirrored in RTL (FR-039)
- [ ] T082 [US1] Create `apps/web/src/features/dashboard/components/module-card.tsx`, show module cards on `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`, create `apps/web/src/app/[locale]/(app)/modules/[moduleKey]/page.tsx` (`requireSession`; `notFound()` unless visible) and `apps/web/src/app/[locale]/(app)/not-found.tsx` (the localized 404 inside the app shell — contracts/routes.md §5), and add the `nav`, `dashboard`, `modules` namespaces (names/descriptions of contracts/permissions.md §4) to both catalogs (FR-035, FR-040)
- [ ] T083 [US1] Create `apps/web/e2e/shell.spec.ts`: student sees exactly Home + Mu'eed, CodeJudge, Kitabi, CareerMap, Tadreeb in nav and cards; `/ar/modules/mizan` and `/ar/modules/unknown` → 404 page inside the shell; keyboard: skip link first, Tab order follows visual order in `ar` and `en`, user menu operable by keyboard; `@mobile`: drawer opens/closes, no horizontal scroll at 320 px; add `/modules/mueed` to `SIGNED_IN_SCREENS`

**Accept**: US1 acceptance scenario 3 (module list) passes · no component compares `role` directly (only `can`/`visibleModules`) · axe passes with the drawer open and with the user menu open · ar + en screenshots (desktop and mobile) in the PR

### PR-20 — Language preference · branch `001-pr20-language-preference`

- [ ] T084 [US1] Add `setLocale` to `packages/db/src/repositories/users.ts` (+ case in `packages/db/test/users.int.test.ts`) and create `apps/web/src/features/profile/actions.ts` with `setLocaleAction` (contracts/server-actions.md §5.1) (FR-037)
- [ ] T085 [US1] Update `apps/web/src/components/shell/locale-switcher.tsx` to call `setLocaleAction` before navigating when a session exists (still a plain link when signed out or without JavaScript)
- [ ] T086 [US1] Extend `apps/web/e2e/auth.spec.ts`: switch to English on the dashboard → same path under `/en`, `dir="ltr"`; sign out; sign in from `/ar/sign-in` → lands on `/en/dashboard`; a new context (other device) also lands on `/en/dashboard`

**Accept**: US1 acceptance scenario 4 passes · `users.locale` is the only persisted preference (no extra cookie introduced)

**Checkpoint**: US1 complete — a student can register, confirm, sign in, see the Arabic home, switch language, sign out.

---

## Phase 4: User Story 2 — A student completes the shared academic profile (Priority: P1)

**Goal**: mandatory profile step (student code, level, division); profile screen.

**Independent Test**: quickstart.md V2.

### PR-21 — Student profile data layer · branch `001-pr21-profile-data`

- [ ] T087 [US2] Create `packages/db/src/schema/student-profiles.ts` (data-model.md §3.6: PK `user_id` FK CASCADE, `tenant_id` default `app_tenant_id()`, `CHECK (student_code ~ '^[A-Za-z0-9-]{3,20}$')`, `CHECK (level BETWEEN 1 AND 7)`, `UNIQUE (tenant_id, student_code)`, composite FK `(tenant_id, division_id)` → `divisions (tenant_id, id)` RESTRICT), generated migration, custom SQL migration `student_profiles_security` (RLS enabled + forced, `tenant_isolation`, grants `SELECT, INSERT, UPDATE`), classification entry
- [ ] T088 [US2] Create `packages/db/src/repositories/student-profiles.ts` (`findByUserId`, `create`, `update`, `maxLevelInUse` with the typed conflict results of contracts/db-api.md §1.6) and export namespace `studentProfiles` (FR-024–FR-026)
- [ ] T089 [US2] Create `packages/db/test/student-profiles.int.test.ts` covering every statement listed for it in contracts/db-api.md §4

**Accept**: two concurrent `create` calls with the same code in one college → exactly one `ok` · same code in two colleges → both `ok` · a division id from another college → `invalid_division` · rls-meta passes

### PR-22 — Profile-completion step · branch `001-pr22-onboarding`

- [ ] T090 [US2] Create `apps/web/src/features/profile/schemas.ts` (`studentProfileSchema`: `studentCode`, `level`, `divisionId`) and `apps/web/src/features/profile/rules.ts` (`isLevelAllowed(level, levelsCount)`, `isDivisionSelectable(division, currentDivisionId)`) with tests in the same folder (FR-025, FR-026)
- [ ] T091 [US2] Add `studentProfile` to `SessionContext` and the incomplete-profile redirect (+ `allowIncompleteProfile`) in `apps/web/src/server/auth/session.ts` per contracts/permissions.md §3 (FR-024)
- [ ] T092 [US2] Add `completeStudentProfileAction` to `apps/web/src/features/profile/actions.ts` (contracts/server-actions.md §5.1; audit `profile.created`) (FR-024–FR-026, FR-044)
- [ ] T093 [US2] Create `apps/web/src/app/[locale]/(onboarding)/layout.tsx`, `apps/web/src/app/[locale]/(onboarding)/onboarding/page.tsx` (contracts/routes.md §3), `apps/web/src/features/profile/components/student-profile-form.tsx` (levels 1…`levelsCount` as «الفرقة الأولى…»; active divisions in the current language; code input `dir="ltr"`), `apps/web/src/features/dashboard/components/student-summary.tsx` shown on the dashboard for students; `onboarding` namespace in both catalogs (FR-040)
- [ ] T094 [US2] Extend `apps/web/e2e/support/flows.ts` (`completeProfile`, `registerOnboardedStudent`) and create `apps/web/e2e/profile.spec.ts` (part 1): new student lands on `/ar/onboarding`; `/ar/dashboard` and `/ar/modules/mueed` redirect to it; valid submit → dashboard shows code, level, division; duplicate code → `student_code_taken` on the field; invalid code format; update earlier specs' helpers so signed-in student flows complete the profile; add `/onboarding` to the a11y list

**Accept**: US2 acceptance scenarios 1–3 pass · level options equal the college's `levels_count` · one `profile.created` audit row · earlier e2e specs still pass

### PR-23 — Profile screen · branch `001-pr23-profile-screen`

- [ ] T095 [US2] Add `setName` to `packages/db/src/repositories/users.ts` (+ test case) and `updateAccountAction`, `updateStudentProfileAction` to `apps/web/src/features/profile/actions.ts` with `accountSchema`, `studentProfileUpdateSchema` (+ tests) in `apps/web/src/features/profile/schemas.ts` (contracts/server-actions.md §5.1; audit `profile.updated {fields}`) (FR-027, FR-044)
- [ ] T096 [US2] Create `apps/web/src/app/[locale]/(app)/profile/page.tsx` (`requireSession('/profile')`), `apps/web/src/features/profile/components/account-form.tsx` (name; email read-only `dir="ltr"`), reuse `student-profile-form.tsx` in edit mode (code read-only; current division offered even if inactive); `profile` namespace in both catalogs
- [ ] T097 [US2] Extend `apps/web/e2e/profile.spec.ts` (part 2): change name → header shows it; change level and division → dashboard shows them; student code not editable (no input, and a forged `studentCode` field is ignored — create `apps/web/e2e/support/forge.ts` with `setFormField`, contracts/server-actions.md §6); add `/profile` to `SIGNED_IN_SCREENS`

**Accept**: US2 acceptance scenarios 5–6 (student part) pass; scenario 4 is covered by PR-21's integration test · forged extra form fields never change `student_code`, `role`, or `status`

**Checkpoint**: US1 + US2 complete — the P1 slice is demonstrable.

---

## Phase 5: User Story 3 — A user recovers a forgotten password (Priority: P2)

**Goal**: request reset → emailed link → new password → all sessions ended.

**Independent Test**: quickstart.md V3.

### PR-24 — Password recovery · branch `001-pr24-password-recovery`

- [ ] T098 [US3] Add `forgotPasswordSchema`, `resetPasswordSchema` (+ tests) to `apps/web/src/features/auth/schemas.ts` and `requestPasswordResetAction`, `resetPasswordAction` to `apps/web/src/features/auth/actions.ts` (contracts/server-actions.md §4.5–4.6; audits — `auth.password_reset` is written from the auth instance's `onPasswordReset` hook added to `apps/web/src/server/auth/auth.ts` in this batch, because `resetPassword` does not return the user; `auth.password_reset_requested` uses `users.findByEmail`) (FR-005, FR-007, FR-009, FR-010, FR-044)
- [ ] T099 [US3] Create `apps/web/src/app/[locale]/(public)/forgot-password/page.tsx` + `apps/web/src/features/auth/components/forgot-password-form.tsx`, and `apps/web/src/app/[locale]/(public)/reset-password/page.tsx` + `apps/web/src/features/auth/components/reset-password-form.tsx` (missing token or `error` param → invalid screen with link to request again)
- [ ] T100 [US3] Create `apps/web/e2e/password-reset.spec.ts`: identical confirmation text for known and unknown email, message only for the known one; reset with the link → old password fails, new works; a second browser context signed in before the reset is signed out on its next navigation; link reused → invalid; link older than 1 h cannot be tested by waiting → assert the configured expiry in a unit test of the auth config export; 4th request per email/hour → `rate_limited`; add both screens to `PUBLIC_SCREENS`

**Accept**: US3 acceptance scenarios 1–3 pass · audit rows `auth.password_reset_requested` and `auth.password_reset` exist for the account's college and none for unknown emails

---

## Phase 6: User Story 4 — The operator onboards a new college and its first administrator (Priority: P2)

**Goal**: operator command creates a college + admin invitation; invitee accepts; colleges are isolated; suspension works.

**Independent Test**: quickstart.md V4.

### PR-25 — Invitations data layer · branch `001-pr25-invitations-data`

- [ ] T101 [US4] Create `packages/db/src/schema/invitations.ts` (data-model.md §3.7: `CHECK (email = lower(email))`, role CHECK (four roles), `token_hash` UNIQUE, status CHECK `('pending','accepted','revoked')` default `'pending'`, `expires_at NOT NULL`, FKs SET NULL, partial unique index `invitations_one_pending_per_email`, index `invitations_tenant_created_idx`), generated migration, custom SQL migration `invitations_security` (RLS enabled + forced, `tenant_isolation`, `invitation_token_lookup` FOR SELECT, grants `SELECT, INSERT, UPDATE`), classification entry
- [ ] T102 [P] [US4] Create `packages/db/src/tokens.ts` (`generateInvitationToken`, `hashInvitationToken`) with `packages/db/src/tokens.test.ts` (43-char base64url; hash is 64 hex; two tokens differ) and add `withInvitationToken` to `packages/db/src/context.ts`
- [ ] T103 [US4] Create `packages/db/src/repositories/invitations.ts` (all eight functions of contracts/db-api.md §1.6) and export namespace `invitations` (FR-020, FR-022)
- [ ] T104 [US4] Create `packages/db/test/invitations.int.test.ts` covering every statement listed for it in contracts/db-api.md §4

**Accept**: two concurrent `claim` calls → exactly one returns the invitation · `findByTokenHash` inside `withInvitationToken(hashA)` cannot see invitation B · no function returns `token_hash` · the plain token is returned only by `create`

### PR-26 — Operator tools: create and suspend colleges · branch `001-pr26-operator-tools`

- [ ] T105 [US4] Add `createAdminInvitation`, `createTenantWithAdmin` (college + `GEN` division + invitation in **one** transaction), and `setTenantStatus` (changes the status only — sessions are **not** deleted, contracts/cli.md §5; already delivered with its `admin.int.test.ts` case in PR-18 for the suspended-college sign-in e2e — reuse it) to `packages/db/src/admin/tenants.ts`, make `seedDemo` in `packages/db/src/admin/seed.ts` ensure the demo admin invitation (data-model.md §5), export from `packages/db/src/admin.ts`; extend `packages/db/test/admin.int.test.ts` (invitation created with audit `invitation.created` actor NULL; `email_has_account`; `createTenantWithAdmin` with an email that has an account leaves no college and no division; suspending changes the status and leaves every session row in place) (FR-018, FR-019)
- [ ] T106 [US4] Create `packages/db/scripts/tenant-create.ts` (calls `createTenantWithAdmin`) and `packages/db/scripts/tenant-set-status.ts` with the exact arguments, outputs, and exit codes of contracts/cli.md §4–6; add root scripts `tenant:create`, `tenant:set-status`; update `packages/db/scripts/seed.ts` to print the invitation link line
- [ ] T107 [US4] Create `packages/db/test/cli.int.test.ts` running both scripts as child processes against `masari_test`: created (exit 0, link printed once), duplicate slug (exit 1, nothing changed), invalid slug (exit 2), email with account (exit 1, college not created), set-status unknown slug (exit 1)

**Accept**: US4 acceptance scenarios 1 and 6 pass at the command level · college, `GEN` division, and invitation are created in one transaction (failure of any leaves nothing — test) · no connection string or token hash is printed · `CLAUDE.md` command table still matches (update if not)

### PR-27 — Accept invitation and college isolation · branch `001-pr27-accept-invitation`

- [ ] T108 [US4] Add `activateInvited` and `deleteJustCreated` to `packages/db/src/repositories/users.ts` (+ the test cases listed for `users.int.test.ts` in contracts/db-api.md §4) and `acceptInvitationSchema` (+ test) to `apps/web/src/features/auth/schemas.ts`
- [ ] T109 [US4] Create `apps/web/src/server/auth/invitation-lookup.ts` (`findUsableInvitation(token)`: hash → `withInvitationToken` + `invitations.findByTokenHash` → `tenants.findById` → pending, unexpired, college active — contracts/server-actions.md §4.7 step 3) and add `acceptInvitationAction` to `apps/web/src/features/auth/actions.ts` exactly as §4.7, using only the functions of contracts/db-api.md §1 in the context named for each step (lookup → `claim` inside `withTenant` → create → activate → `setAcceptedUser` + audit `invitation.accepted` in one transaction; on failure delete the just-created account, then `release`) (FR-009, FR-011, FR-020, FR-021, FR-044)
- [ ] T110 [US4] Create `apps/web/src/app/[locale]/(public)/invite/[token]/page.tsx` (uses `findUsableInvitation`; valid: college name in the current language, role label, form; otherwise the "no longer valid" screen — same screen for expired, revoked, used, unknown, and suspended college) and `apps/web/src/features/auth/components/accept-invitation-form.tsx`
- [ ] T111 [US4] Create `apps/web/e2e/support/operator.ts` (`createCollege(slug, adminEmail)` → invitation link through `createTenantWithAdmin`, `setCollegeStatus`, via `@masari/db/admin`), extend `flows.ts` (`acceptInvitation`), and create `apps/web/e2e/college-onboarding.spec.ts`: accept → sign in → dashboard with the college's name and role label; used link → invalid screen; tampered token → invalid screen; double submit creates one account; college B admin's dashboard/onboarding data never contains college A names or divisions and vice-versa; suspend college B → its admin's next navigation goes to `/ar/sign-in?reason=tenant_suspended` with the banner (the session row still exists — suspension does not delete sessions — so the reason is known), sign-in returns `tenant_suspended`, college A unaffected; reactivate → sign-in works; an invitation link of a suspended college shows the invalid screen; add `/invite/<valid token>` to the a11y scan

**Accept**: US4 acceptance scenarios 2–5 pass · invited account has `email_verified=true`, the invited role, consent time set, and received no confirmation email (`countEmails` = 0) · quickstart.md V4 works by hand

**Checkpoint**: a second college can be onboarded and is isolated from the first.

---

## Phase 7: User Story 5 — The college administration invites staff, and each role sees only what it may use (Priority: P2)

**Goal**: admin invites by email with a role; role-aware navigation; non-permitted screens/actions refused.

**Independent Test**: quickstart.md V5.

### PR-28 — Invite staff: create and list · branch `001-pr28-invite-staff`

- [ ] T112 [US5] Create `apps/web/src/features/invitations/schemas.ts` (`createInvitationSchema`: `email`, `role`) with test, and `apps/web/src/features/invitations/actions.ts` with `createInvitationAction` (contracts/server-actions.md §5.2: permission, rate limit `invite-create`, `email_unavailable` rules, send `invitation` email, audit) (FR-020, FR-044)
- [ ] T113 [P] [US5] Add shadcn/ui `table` to `apps/web/src/components/ui/`
- [ ] T114 [US5] Create `apps/web/src/app/[locale]/(app)/admin/invitations/page.tsx` (`requirePermission('admin.invitations.manage', '/admin/invitations')`), `apps/web/src/features/invitations/components/invite-form.tsx`, `apps/web/src/features/invitations/components/invitations-table.tsx` (email `dir="ltr"`, role, display status, created and expiry dates via `formatDate`; caption; no actions yet); add the Invitations entry to `nav-items.ts` and an admin shortcut card `apps/web/src/features/dashboard/components/admin-shortcuts.tsx` on the dashboard; `admin.invitations` namespace (FR-022, FR-040)
- [ ] T115 [US5] Extend `apps/web/e2e/support/flows.ts` (`signInAsDemoAdmin` using the seed invitation; `inviteAndAccept(role)`) and create `apps/web/e2e/invitations.spec.ts` (part 1): admin invites faculty → pending row + one `invitation` message whose link opens the accept screen with the right college and role; invitee accepts and signs in; inviting an email that has an account → `email_unavailable`; inviting the same email twice → `email_unavailable`; student opening `/ar/admin/invitations` → 404; add the screen to `SIGNED_IN_SCREENS` (admin)

**Accept**: US5 acceptance scenarios 1–2 pass · the message is identical for "has an account" and "already invited" · invitation link in the email is `{APP_URL}/ar/invite/<token>` · ar + en screenshots

### PR-29 — Revoke invitations; registration with a pending invitation · branch `001-pr29-revoke-invitations`

- [ ] T116 [US5] Add `revokeInvitationAction` to `apps/web/src/features/invitations/actions.ts` (+ `revokeInvitationSchema` and test) and a revoke button (form) for pending rows in `apps/web/src/features/invitations/components/invitations-table.tsx` (FR-022, FR-044)
- [ ] T117 [US5] Add step 6 of contracts/server-actions.md §4.1 to `registerStudentAction` in `apps/web/src/features/auth/actions.ts` (pending invitation → `invitation-pending` email, same redirect, no account) (FR-023)
- [ ] T118 [US5] Extend `apps/web/e2e/invitations.spec.ts` (part 2): revoke → row shows revoked and the link shows the invalid screen; revoking an invitation id of another college (forged form) → `not_found`, nothing changes; self-registration with an invited email → "check your email" screen, one `invitation-pending` message, zero `verify-email` messages, no user row; expired invitation shows as expired (add `expireInvitation` to `packages/db/src/admin/test-support.ts` and `e2e/support/db.ts`) and can be replaced by a new invitation

**Accept**: US5 acceptance scenarios 3 and 6 pass · `invitation.revoked` audit row written

### PR-30 — Role-based access matrix · branch `001-pr30-rbac-matrix`

- [ ] T119 [US5] Create `apps/web/e2e/support/roles.ts` (creates and caches one signed-in storage state per role in a fresh college: admin via operator link, faculty/student_affairs via invitation, student via registration + profile)
- [ ] T120 [US5] Create `apps/web/e2e/rbac.spec.ts`: for each role assert navigation entries and dashboard cards equal contracts/permissions.md §5; every `(app)` path of contracts/routes.md §4 not permitted to the role returns the 404 page and none of the restricted page's headings; faculty/student_affairs/admin are never redirected to `/onboarding`; both locales for one role (FR-014, FR-015, FR-016)
- [ ] T121 [US5] Add `submitAs` to `apps/web/e2e/support/forge.ts` and extend `apps/web/e2e/rbac.spec.ts`: forbidden-for-non-admin test using the technique of contracts/server-actions.md §6 — open `/ar/admin/invitations` as the admin so the real forms are rendered, swap the context's cookies for the student's (from `roles.ts` storage state) without reloading, submit the invite form and a revoke form → the error summary shows `forbidden`, and no invitation row or audit row changed (`e2e/support/db.ts`). No hand-built Server Action request. The test is a table of `{ screen, form, action }` rows; later admin batches (PR-33…PR-36) append their actions to it

**Accept**: US5 acceptance scenarios 4–5 pass · the spec is data-driven from a single expectation table mirroring contracts/permissions.md §5 · SC-004 evidence: test output lists role × capability cases

**Checkpoint**: staff can be invited; every role sees only its own areas.

---

## Phase 8: User Story 6 — The college administration manages its people (Priority: P3)

**Goal**: list/search users, change roles, suspend/reactivate, correct student data.

**Independent Test**: quickstart.md V6.

### PR-31 — People data layer · branch `001-pr31-people-data`

- [ ] T122 [US6] Add `findInTenant`, `listInTenant`, `setRole`, `setStatus` to `packages/db/src/repositories/users.ts` exactly as contracts/db-api.md §1.6 (search over name, email, student code with escaped wildcards; filters; `page`/`pageSize`; order `created_at DESC, id`; join to `student_profiles` and `divisions`) (FR-029–FR-031)
- [ ] T123 [US6] Extend `packages/db/test/users.int.test.ts` with every statement listed for it in contracts/db-api.md §4 (tenant filter on each function; `%`/`_` literal search; totals with filters; page 2; cross-college `setRole`/`setStatus` return null/false and change nothing)

**Accept**: `listInTenant` issues a bounded number of queries independent of row count (two: rows + count) · a search for `%` returns only users whose data contains a literal `%`

### PR-32 — People list screen · branch `001-pr32-people-list`

- [ ] T124 [US6] Create `apps/web/src/features/admin-users/schemas.ts` (`usersFilterSchema` parsing `q`, `role`, `status`, `page` from search params; invalid values → absent) with test
- [ ] T125 [US6] Create `apps/web/src/app/[locale]/(app)/admin/users/page.tsx` (`requirePermission('admin.users.manage', '/admin/users')`; reads filters; `withTenant` → `users.listInTenant`), `apps/web/src/features/admin-users/components/users-filters.tsx` (GET form: search, role, status), `apps/web/src/features/admin-users/components/users-table.tsx` (name, email `dir="ltr"`, role, status badge with text, student code/level/division, joined date; caption; scroll region on narrow screens), pagination links (previous/next + "page x of y", preserving filters); People entry in `nav-items.ts` and shortcut in `admin-shortcuts.tsx`; `admin.users` namespace (FR-029)
- [ ] T126 [US6] Create `apps/web/e2e/admin-users.spec.ts` (part 1): list shows only own-college users (a second college's users never appear); search by part of name, email, student code; filter by role and by status; 21+ users → page 2; invalid `page=abc` treated as 1; add the screen to `SIGNED_IN_SCREENS` (admin) and `/ar/admin/users` (300 KB) to the script budget

**Accept**: US6 acceptance scenario 1 passes · page size is 20 · filters work without JavaScript

### PR-33 — Role change and suspension · branch `001-pr33-role-suspension`

- [ ] T127 [US6] Create `apps/web/src/features/admin-users/rules.ts` (`canActOnUser(actorId, targetId)`) with test, add `changeRoleSchema`, `setStatusSchema` (+ tests) to `schemas.ts`, and create `apps/web/src/features/admin-users/actions.ts` with `changeUserRoleAction`, `setUserStatusAction` (contracts/server-actions.md §5.3; revoke sessions on suspend; audits) (FR-030, FR-031, FR-044)
- [ ] T128 [P] [US6] Add shadcn/ui `dialog` to `apps/web/src/components/ui/`
- [ ] T129 [US6] Create `apps/web/src/features/admin-users/components/role-dialog.tsx` and `status-button.tsx` (confirmation step for suspend) and add them as row actions in `users-table.tsx`; no actions rendered on the acting admin's own row
- [ ] T130 [US6] Extend `apps/web/e2e/admin-users.spec.ts` (part 2): change faculty → student_affairs, the target's next page load shows the new navigation; suspend a student → their open context is sent to sign-in on next navigation, sign-in shows `account_suspended` only with the correct password, reactivate → sign-in works; forged self role change / self suspension → `forbidden`; forged id of another college's user → `not_found`, no change; append both actions to the forbidden-for-non-admin test in `apps/web/e2e/rbac.spec.ts`

**Accept**: US6 acceptance scenarios 2, 3, 4, 6 pass · audit rows `user.role_changed {from,to}`, `user.suspended`, `user.reactivated` written · dialogs trap focus and close on Escape

### PR-34 — Correct a student's academic data · branch `001-pr34-admin-student-profile`

- [ ] T131 [US6] Add `adminUpdateStudentProfileAction` to `apps/web/src/features/admin-users/actions.ts` with `adminStudentProfileSchema` (+ test) (contracts/server-actions.md §5.3; creates the profile when missing; audit) (FR-028, FR-044)
- [ ] T132 [US6] Create `apps/web/src/features/admin-users/components/student-profile-dialog.tsx` (code, level, division — same field rules and labels as the student form) as a row action for students in `users-table.tsx`
- [ ] T133 [US6] Extend `apps/web/e2e/admin-users.spec.ts` (part 3): correct a student's code and level → visible in the list and on the student's dashboard; code already used → `student_code_taken`; target that is not a student or belongs to another college → `not_found`; append the action to the forbidden-for-non-admin test in `rbac.spec.ts`

**Accept**: US6 acceptance scenario 5 passes · `profile.updated` audit row has the admin as actor and lists changed fields only

---

## Phase 9: User Story 7 — The college administration configures the college (Priority: P3)

**Goal**: names, allowed email domains, number of levels, module switches, divisions.

**Independent Test**: quickstart.md V7.

### PR-35 — College settings and module switches · branch `001-pr35-college-settings`

- [ ] T134 [US7] Create `apps/web/src/features/tenant-settings/schemas.ts` (`tenantSettingsSchema`: `nameAr`, `nameEn`, `allowedEmailDomains`, `levelsCount`, `enabledModules`) and `apps/web/src/features/tenant-settings/rules.ts` (`parseDomains(text)` → normalised list or error; `changedFields(before, after)`) with tests (domain regex of data-model.md §3.1; ≤ 20; de-duplication; registry order for modules) (FR-032, FR-034)
- [ ] T135 [US7] Create `apps/web/src/features/tenant-settings/actions.ts` with `updateTenantSettingsAction` (contracts/server-actions.md §5.4: `levels_in_use` with `meta.min` from `studentProfiles.maxLevelInUse`; audits `tenant.settings_updated`, `tenant.modules_updated`; `revalidatePath('/', 'layout')`) (FR-032, FR-034, FR-044)
- [ ] T136 [US7] Create `apps/web/src/app/[locale]/(app)/admin/settings/page.tsx` (`requirePermission('admin.settings.manage', '/admin/settings')`) and `apps/web/src/features/tenant-settings/components/settings-form.tsx` (Arabic name input `dir="rtl"`, English name `dir="ltr"`, domains textarea `dir="ltr"`, levels select 1–7, six module checkboxes with module names in a `fieldset`/`legend`); Settings entry in `nav-items.ts` and shortcut; `admin.settings` namespace
- [ ] T137 [US7] Create `apps/web/e2e/admin-settings.spec.ts`: rename college → header shows it for another user of the college; set domain `example.edu` → registration with another domain refused naming `example.edu`, with `x@example.edu` accepted; clear domains → any email accepted; levels below a level in use → `levels_in_use` with the minimum; disable Kitabi → gone from student and admin navigation and dashboard, `/ar/modules/kitabi` → 404, re-enable restores; append the action to the forbidden-for-non-admin test in `rbac.spec.ts`; add the screen to `SIGNED_IN_SCREENS` (admin)

**Accept**: US7 acceptance scenarios 1, 2, 3, 6 pass · US1 acceptance scenario 8 (domain restriction) passes · a second college's settings are unchanged (asserted via `operator.ts`)

### PR-36 — Divisions management · branch `001-pr36-divisions`

- [ ] T138 [US7] Create `apps/web/src/features/divisions/schemas.ts` (`createDivisionSchema`, `updateDivisionSchema`, `setDivisionActiveSchema`) with tests and `apps/web/src/features/divisions/actions.ts` with `createDivisionAction`, `updateDivisionAction`, `setDivisionActiveAction` (contracts/server-actions.md §5.5; audits) (FR-033, FR-044)
- [ ] T139 [US7] Create `apps/web/src/app/[locale]/(app)/admin/divisions/page.tsx` (`requirePermission('admin.settings.manage', '/admin/divisions')`; lists inactive too), `apps/web/src/features/divisions/components/division-form.tsx` (add; edit mode without the code field), `apps/web/src/features/divisions/components/divisions-table.tsx` (code `dir="ltr"`, both names, order, status, edit and activate/deactivate actions); Divisions entry in `nav-items.ts` and shortcut; `admin.divisions` namespace
- [ ] T140 [US7] Create `apps/web/e2e/admin-divisions.spec.ts`: add `SE` → offered on a student's profile screen; duplicate code → `code_taken`; lower-case code input is stored upper-case; edit names/order → list order changes; deactivate a division in use → not offered to other students, still shown on the profile of a student who has it, that student can keep it when saving; reactivate; forged id from another college → `not_found`; append the three actions to the forbidden-for-non-admin test in `rbac.spec.ts`; add the screen to `SIGNED_IN_SCREENS` (admin)

**Accept**: US7 acceptance scenarios 4–5 pass · there is no delete control or action · audit rows `division.created`, `division.updated`, `division.deactivated`, `division.activated` written

**Checkpoint**: all seven user stories are complete.

---

## Phase 10: Polish & Cross-Cutting Concerns

### PR-37 — Browser protections · branch `001-pr37-browser-protections`

- [ ] T141 Add the response headers of contracts/http-and-env.md §2 to `apps/web/next.config.ts` (CSP with the development-only additions; HSTS only when `APP_URL` is https) and create `apps/web/src/app/robots.ts` (`Disallow: /`) (FR-048, FR-049)
- [ ] T142 Create `apps/web/e2e/security-headers.spec.ts`: every header and exact CSP value on `/ar/sign-in`, `/ar/dashboard`, and `/api/health`; no `X-Powered-By`; `/robots.txt` disallows all; no console CSP violation on any screen of the a11y lists (listen for `securitypolicyviolation`); a cross-origin POST to a Server Action endpoint is rejected

**Accept**: all screens work with the CSP (no violation events in e2e) · headers present on HTML, API, and static asset responses

### PR-38 — Final sweep and documentation · branch `001-pr38-final-sweep`

- [ ] T143 Complete the lists in `apps/web/e2e/a11y.spec.ts` and `apps/web/e2e/perf-budget.spec.ts` so every screen of contracts/routes.md §2–4 is scanned in both locales (signed-in screens with the appropriate role) and budgets cover `/ar/sign-in`, `/ar/register`, `/ar/dashboard`, `/ar/admin/users`; add an `@mobile` check that no screen scrolls horizontally at 320 px and that every screen is usable at 200% zoom (viewport 640×400 at device scale factor 2) (FR-042, FR-043)
- [ ] T144 [P] Complete `docs/deployment.md` per research.md §21 (pilot on Vercel + Neon + SMTP provider: environment variables including `TRUSTED_PROXY_HOPS` and the proxy rule of contracts/http-and-env.md §5, two database URLs, running `pnpm db:migrate` and `pnpm tenant:create` against the hosted database, what the owner must create and keep secret, smoke test with `/api/health`)
- [ ] T145 [P] Update `README.md` (status, links), verify `CLAUDE.md` commands/conventions against the final code and correct any drift, and make sure `.env.example` lists every variable read by `getEnv()`/`getDbEnv()`/`getAdminDbEnv()` (add a unit test `apps/web/src/server/env-example.test.ts` that parses `.env.example` and fails on a missing variable)
- [ ] T146 Run quickstart.md end to end on a clean clone (Option A or B) and V1–V8 by hand; run Lighthouse (mobile preset) on `/ar/sign-in` and `/ar/dashboard` against the production build; record timings (setup minutes; LCP, INP/TBT, CLS) in the PR description; fix or report anything outside SC-006/SC-008 (FR-047)

**Accept**: axe: zero serious/critical on every listed screen in `ar` and `en` · script budgets pass with the measured values printed · quickstart completed in < 15 minutes (SC-008) · every FR in spec.md is ticked against a merged batch in the PR description's traceability table

---

## Dependencies & Execution Order

### Batch order

Strictly sequential: `PR-1 → PR-2 → … → PR-38`. This is the only supported order for the single
implementer/reviewer workflow; the notes below explain why and what could move if the owner re-prioritises.

### Phase dependencies

- **Setup (PR-1, PR-2)**: no dependencies.
- **Foundational (PR-3…PR-14)**: depends on Setup; blocks every user story. Internal order:
  database (3→4→5→6) ; UI base (7→8) ; runtime + harness (9→10, needs 6 and 8) ; email (11) ; auth (12,
  needs 4 and 11) ; permissions (13, needs 12) ; guards (14, needs 6 and 13).
- **US1 (PR-15…PR-20)**: needs Foundational.
- **US2 (PR-21…PR-23)**: needs US1 (a signed-in student).
- **US3 (PR-24)**: needs PR-18 only; could move directly after US1.
- **US4 (PR-25…PR-27)**: needs PR-18; independent of US2/US3 code, but its e2e reuses their helpers.
- **US5 (PR-28…PR-30)**: needs US4 (an administrator exists only through an invitation).
- **US6 (PR-31…PR-34)**: needs US4 (admin) and US2 (profiles); PR-34 needs PR-21.
- **US7 (PR-35, PR-36)**: needs US4 (admin) and US2 (levels in use, division selection).
- **Polish (PR-37, PR-38)**: after all stories.

### Within a batch

Schemas/rules and their unit tests → repositories and integration tests → actions → pages/components →
e2e. Tasks marked [P] touch different files and may be done in any order within the batch.

### Parallel opportunities

The delivery workflow is one batch at a time. If the owner later runs two implementers, these pairs do not
touch the same files and could proceed in parallel after their common prerequisite: PR-7/PR-8 with
PR-3…PR-6; PR-11 with PR-9/PR-10; PR-24 (US3) with PR-21…PR-23 (US2); PR-36 with PR-31…PR-34. Message
catalogs (`messages/*.json`) and `e2e/a11y.spec.ts` are shared files — parallel batches must rebase.

## Parallel Example: PR-11

```text
T050 — five template files can be written independently of T048 (transport) once T049 (layout) exists.
T051 — e2e email helper depends only on the capture file format in contracts/emails.md §1.
```

## Implementation Strategy

### MVP first

1. PR-1…PR-14 — foundation (no user-visible feature yet; CI, database isolation, auth core are proven by tests).
2. PR-15…PR-20 — **US1**: first demonstrable slice (register → confirm → sign in → Arabic home). Validate with quickstart V1.
3. PR-21…PR-23 — **US2**: shared academic profile. P1 scope complete; this is the smallest state worth showing to students.

### Incremental delivery

4. PR-24 — US3 password recovery.
5. PR-25…PR-27 — US4 college onboarding and isolation (first point where a second college exists).
6. PR-28…PR-30 — US5 staff invitations and the full role matrix.
7. PR-31…PR-34 — US6 people management.
8. PR-35…PR-36 — US7 college settings.
9. PR-37…PR-38 — protections, full accessibility/performance sweep, deployment guide.

After each checkpoint the system is releasable for the stories completed so far.

## Requirement coverage

| Requirement | Batches |
|---|---|
| FR-001–FR-003 | PR-16 (domain rule end-to-end in PR-35) |
| FR-004, FR-005 | PR-12, PR-16, PR-17, PR-24 |
| FR-006 | PR-18 |
| FR-007 | PR-12, PR-16, PR-24 |
| FR-008 | PR-12, PR-14, PR-18 |
| FR-009 | PR-6, PR-14, PR-16, PR-17, PR-18, PR-24, PR-27, PR-28 |
| FR-010 | PR-12, PR-24 |
| FR-011 | PR-15, PR-16, PR-27 |
| FR-012, FR-013 | PR-12, PR-16 |
| FR-014–FR-016 | PR-13, PR-14, PR-19, PR-30 |
| FR-017 | PR-3, PR-4, PR-5, PR-21, PR-25, PR-27 |
| FR-018, FR-019 | PR-6, PR-14, PR-18, PR-26, PR-27 |
| FR-020–FR-022 | PR-25, PR-27, PR-28, PR-29 |
| FR-023 | PR-29 |
| FR-024–FR-027 | PR-21, PR-22, PR-23 |
| FR-028 | PR-34 |
| FR-029–FR-031 | PR-31, PR-32, PR-33 |
| FR-032, FR-034 | PR-4, PR-35 |
| FR-033 | PR-5, PR-36 |
| FR-035 | PR-13, PR-19 |
| FR-036 | PR-7, PR-10 |
| FR-037 | PR-20 |
| FR-038 | PR-11 |
| FR-039, FR-040 | PR-18, PR-19, PR-22, PR-28 |
| FR-041 | PR-7 |
| FR-042 | PR-10, PR-15, every screen batch, PR-38 |
| FR-043 | PR-10, PR-18, PR-32, PR-38 |
| FR-044 | PR-5, PR-14, and every batch whose action lists an audit |
| FR-045 | PR-9 |
| FR-046 | PR-2, PR-7, PR-8, PR-10 |
| FR-047 | PR-3, PR-6, PR-38 |
| FR-048, FR-049 | PR-7 (noindex metadata), PR-37 |
| SC-003 | PR-3…PR-5, PR-21, PR-25 (isolation tests), PR-27 (e2e) |
| SC-004 | PR-13 (matrix), PR-30 (e2e matrix) |
| SC-005, SC-006 | PR-10, PR-38 |
| SC-007 | PR-26, PR-27 |
| SC-008, SC-009 | PR-2, PR-38 |

SC-001, SC-002 (audit part), and SC-010 are validated by hand in PR-38 / the pilot (usability outcomes).

## Notes

- A task that names a contract section must implement that section completely — the contract is the
  detailed specification; this file only orders the work.
- Library call names in research.md are indicative; observable behaviour in contracts is binding
  (plan.md "Implementation latitude"). Report differences under **Spec deviation**.
- If a batch cannot meet an Accept line, do not weaken the test: stop and report.
