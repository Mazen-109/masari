# Masari (مساري) — working rules for agents

Multi-tenant platform for university students, faculty, Student Affairs, and college administration.
Six modules (Mu'eed, CodeJudge, Mizan, Kitabi, CareerMap, Tadreeb) on one shared foundation.

**Read first, in this order:** `.specify/memory/constitution.md` (binding) → `docs/roadmap.md` →
the active feature folder `specs/NNN-name/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`, `tasks.md`). Product source: `docs/masari-spec-en.html`.
If this file and the constitution disagree, the constitution wins.

## Stack

TypeScript (strict) · Node 24 LTS (min 22) · pnpm 10 workspaces · Next.js 16 App Router (React 19,
Server Components + Server Actions) · Tailwind CSS 4 + shadcn/ui · next-intl 4 (`ar` default, `en`) ·
PostgreSQL 16+ with row-level security · Drizzle ORM + `pg` · Better Auth 1.x · Zod 4 · Nodemailer ·
Vitest · Playwright + axe · ESLint + Prettier · GitHub Actions.

Use the official docs of the **pinned** versions (see `package.json`), not memory — e.g. Next.js 16 uses
`src/proxy.ts` (not `middleware.ts`) and async `params`.

## Layout

```text
apps/web/            Next.js app: src/app (routes), src/features/<feature> (schemas, rules, actions, components),
                     src/server (auth, email, env, audit, rate-limit), src/components, src/i18n, messages/, e2e/
packages/db/         Drizzle schema, SQL migrations (+RLS), repositories, withTenant(), scripts (migrate, seed, tenant-create)
specs/NNN-name/      Spec Kit documents per feature
docs/                Product spec, roadmap, delegation, deployment
.specify/            Spec Kit templates, scripts, constitution
```

## Commands

Available once feature 001 / PR-1 is merged (run from the repo root):

| Purpose | Command |
|---|---|
| Install | `pnpm install` |
| Start local PostgreSQL (Docker) | `pnpm db:up` (stop: `pnpm db:down`) |
| Apply migrations + ensure runtime DB role | `pnpm db:migrate` |
| Seed demo college | `pnpm db:seed` |
| Create a college + first-admin invitation | `pnpm tenant:create --slug <slug> --name-ar "<…>" --name-en "<…>" --admin-email <email>` |
| Suspend / reactivate a college | `pnpm tenant:set-status --slug <slug> --status active\|suspended` |
| Generate a migration after a schema change | `pnpm db:generate` |
| Dev server (http://localhost:3000) | `pnpm dev` |
| Lint / format / types | `pnpm lint` · `pnpm format` (check: `pnpm format:check`) · `pnpm typecheck` |
| i18n parity / RTL utilities | `pnpm i18n:check` · `pnpm rtl:check` |
| Unit + integration tests (needs PostgreSQL) | `pnpm test` |
| End-to-end tests (builds first) | `pnpm test:e2e` |
| Production build | `pnpm build` |
| Everything CI runs except e2e | `pnpm check` |

Local setup: copy `.env.example` to `.env` (repo root) and follow `specs/001-platform-foundation/quickstart.md`.
No Docker (e.g. cloud sessions)? Use the machine's PostgreSQL 16+ as described in the quickstart.

## Conventions

- **Tenant safety**: all college-owned data is read/written only via `@masari/db` repositories inside
  `withTenant({ tenantId, userId }, tx => …)`. Every new tenant-scoped table ships with `tenant_id`, an RLS
  policy, grants, a table-classification entry, and a cross-tenant isolation test — in the same PR.
- **Authorisation**: every page under `(app)` and every server action starts with `requireSession()` /
  `requirePermission()`; never rely on hidden links or on `proxy.ts`.
- **Server actions**: `guard → Zod validate → rate-limit (if public) → repository calls → audit → return
  ActionResult`. Never throw raw errors to the client; never return more data than the screen needs.
- **Feature folders**: `schemas.ts` (Zod), `rules.ts` (pure business rules), `actions.ts` (`"use server"`),
  `components/`. Pure logic is unit-tested; repositories are integration-tested; flows are e2e-tested.
- **i18n**: no literal user-facing text in components. Add every key to both `apps/web/messages/ar.json`
  and `en.json`. Arabic is written natively (الفرقة، الشعبة، شئون الطلاب، كود الطالب).
- **RTL**: logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`); wrap
  emails/codes/URLs in `dir="ltr"` or `<bdi>`; mirror directional icons.
- **Accessibility**: semantic HTML, labelled controls, visible focus, keyboard-complete flows; add every new
  screen to the axe scan list in `apps/web/e2e/a11y.spec.ts`.
- **UI work**: follow the Impeccable skill (`.claude/skills/impeccable`) together with `PRODUCT.md` and
  `DESIGN.md`; change design tokens, not one-off colours.
- **Logging**: use `src/server/log.ts`; never log emails, names, student codes, tokens, or passwords.
- **Dependencies**: justify every new runtime dependency in the PR; permissive licences only.
- **Migrations**: forward-only; never edit a merged migration.

## Never commit secrets

No credentials, tokens, keys, connection strings with real passwords, `.env*` files (except `.env.example`
with placeholders), or real student data — in code, tests, fixtures, docs, or logs. If you see a secret in
the repo or in a diff, stop and report it; it must be rotated, not just removed.

## PR / review workflow

1. Work is assigned as one **PR batch** from the feature's `tasks.md` (`PR-1`, `PR-2`, …). One batch = one
   pull request. Do only that batch; do not start the next one.
2. Branch from up-to-date `main`: `NNN-prNN-short-slug` (e.g. `001-pr03-db-foundation`).
   PR title: `[NNN PR-N] Summary`. Conventional Commits. Target ≤ ~400 changed lines (generated files,
   lockfile, copied shadcn components, fonts, and message catalogs excluded).
3. Implement the batch's tasks exactly as specified, with tests in the same PR. Tick the tasks (`[x]`) in
   `tasks.md`. Update `.env.example`, this file, and docs if commands/env/conventions changed.
4. Before pushing: `pnpm check` and (when the batch touches UI or flows) `pnpm test:e2e`. If Playwright
   browsers cannot be installed locally, say so in the PR and rely on the CI e2e job — never skip writing
   the e2e tests.
5. If the spec/plan/contracts are wrong or incomplete, do not improvise silently: add a **Spec deviation**
   section to the PR description (what, why, proposed document change).
6. All CI gates must be green: format, lint, typecheck, i18n/RTL checks, tests + coverage, build, e2e + axe
   + JS budget, gitleaks, dependency audit. Never disable, skip, or weaken a gate or a test.
7. **Implementer**: Claude Opus 5.5 (`claude-opus-5-5`). **Reviewer**: Claude Fable 5.2
   (`claude-fable-5-2`, read-only) — ends with `VERDICT: APPROVE` or `VERDICT: CHANGES_REQUESTED`.
   Fixes go to the same PR.
8. **Merge**: the orchestrator (the main session that dispatches work; authorised by the owner) squash-merges
   the PR once CI is green **and** Fable 5.2 returned `VERDICT: APPROVE` on the latest commit, then moves to
   the next batch. Implementer and reviewer never merge. The orchestrator stops and asks the owner instead
   when a PR amends the constitution, changes roadmap/spec scope, needs a secret or external account, or
   has an unaccepted Spec deviation. See `docs/delegation.md` for how to dispatch.

## Spec Kit

Skills live in `.claude/skills/speckit-*`; templates in `.specify/templates/`. Feature folders are
`specs/NNN-short-name/`. When running a Spec Kit script by hand, prefix it with
`SPECIFY_FEATURE=<feature-dir-name>`. Do not run `.specify/scripts/bash/create-new-feature.sh` unless the
owner asks (it switches git branches).
