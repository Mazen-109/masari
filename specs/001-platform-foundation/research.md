# Research & Technical Decisions: Platform Foundation

**Feature**: `001-platform-foundation` · **Date**: 2026-11-14 · **Phase**: 0 (speckit-plan)

Every unknown in the plan's Technical Context is resolved here. Format per item: **Decision** ·
**Rationale** · **Alternatives considered**. There are no open `NEEDS CLARIFICATION` items.

> **Verification caveat.** The planning sandbox had no access to the npm registry or to library
> documentation sites, so version numbers and library API names below come from the architect's knowledge
> (mid-2026). Major versions are binding; exact versions are pinned by task T001, which also fills the
> table in §24. Where this document names a library API (function, option, file convention), the
> implementer MUST check it against the official documentation of the pinned version. If the API differs,
> implement the **same observable behaviour** with the documented equivalent and note it under "Spec
> deviation" in the PR — observable behaviour (contracts, data model, acceptance checks) is binding;
> library call names are not.

## 1. Language, runtime, package manager

- **Decision**: TypeScript in strict mode everywhere; Node.js 24 LTS in CI and `.nvmrc`, `engines.node`
  `>=22`; pnpm 10 workspaces with `packageManager` pinned.
- **Rationale**: one language for UI, server, scripts, and tests; Node 24 is the active LTS; cloud agent
  sessions currently ship Node 22, so 22 stays supported; pnpm is strict about undeclared dependencies.
- **Alternatives**: Python backend (FastAPI/Django) + React — better AI/ML ecosystem, but two languages and
  two deployables; the AI work in later features is API orchestration that TypeScript handles well. Bun —
  less documented failure modes for a student team.

## 2. Repository layout

- **Decision**: pnpm workspace with exactly two packages: `apps/web` (`@masari/web`, the Next.js app) and
  `packages/db` (`@masari/db`, schema + migrations + RLS + repositories + operator scripts). `@masari/db` is
  consumed as TypeScript source (`exports` → `./src/*.ts`, `transpilePackages` in Next). No Turborepo/Nx.
- **Rationale**: the database layer is the tenant-isolation boundary; a package boundary lets lint rules
  forbid raw database access from the web app, lets RLS tests run without Next.js, and will be reused by the
  worker processes later features add. Two packages need no build orchestrator (`pnpm -r` is enough).
- **Alternatives**: single Next.js app — simplest, but the boundary would be a convention only. More
  packages (`ui`, `config`, `auth`) — speculative (constitution VII).

## 3. Web framework conventions (Next.js 16, App Router)

- **Decision**: Server Components by default; mutations are Server Actions used with React 19
  `useActionState`; route handlers only for `/api/health` and the restricted `/api/auth/*`. Request
  interception lives in `apps/web/src/proxy.ts` (Next.js 16 name for middleware) and does **only** locale
  routing. `params`/`searchParams` are awaited (they are Promises). Cache Components, React Compiler, typed
  routes, and edge runtime are not enabled. All signed-in pages are dynamic.
- **Rationale**: server-first rendering suits slow phones; Server Actions give CSRF protection (same-origin
  check) and progressive enhancement without a hand-written API; keeping authorisation out of the proxy
  avoids the class of middleware-bypass vulnerabilities.
- **Alternatives**: separate REST/tRPC API — more surface and code with no consumer yet. Remix/React Router
  7, SvelteKit, Nuxt — fine frameworks, smaller Arabic/RTL component ecosystem and less material for
  students.

## 4. Multi-tenancy model

- **Decision**: one database, one schema. Every college-owned table has `tenant_id uuid NOT NULL DEFAULT
  app_tenant_id()` and row-level security **enabled and forced** with policy
  `tenant_isolation: USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())`.
  `app_tenant_id()` is `nullif(current_setting('app.tenant_id', true), '')::uuid`, so a missing context
  yields no rows (fail closed). All access happens inside `withTenant({ tenantId, userId }, fn)`, which opens
  a transaction and calls `set_config('app.tenant_id', …, true)` / `set_config('app.user_id', …, true)`
  (transaction-local, safe with connection pooling). RLS enforces *tenant* isolation only; per-user rules
  are application permissions.
- **Rationale**: a forgotten `WHERE tenant_id = …` is the classic multi-tenant leak, and most queries will
  be written by an AI implementer; RLS makes that mistake harmless and testable (constitution III).
  Retrofitting RLS later would touch every table and query.
- **Alternatives**: application-only filtering — one bug away from a cross-college leak. Schema- or
  database-per-tenant — strongest isolation but migrations × tenants and connection sprawl; overkill for
  tens of colleges and awkward on free tiers. Kept as the on-premises story instead: an on-prem college is
  simply a deployment with one tenant.

## 5. Database roles and migrations

- **Decision**: two connection strings. `DATABASE_MIGRATION_URL` (owner; used only by `pnpm db:*`,
  `pnpm tenant:*`, and tests) runs migrations. `DATABASE_URL` (runtime login role, e.g. `masari_web`) is
  what the web app uses. A `NOLOGIN` group role `masari_app` is created by the first migration and receives
  every table grant explicitly; `pnpm db:migrate` then idempotently creates/updates the runtime login role
  named in `DATABASE_URL` (`NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE INHERIT`, password
  from the URL) and grants it membership of `masari_app`. At start-up the web app calls
  `assertSafeRuntimeRole()` and refuses to run if its role is superuser, has `BYPASSRLS` or `REPLICATION`, or
  owns a table in schema `public` — directly or as a member of a role that owns one (any membership, even one
  granted `WITH INHERIT FALSE`, because the member can `SET ROLE` to the owner) — since a table owner is not
  subject to the non-forced RLS of `tenants`. Tables come from Drizzle schema via
  `drizzle-kit generate`; functions, roles, grants, RLS, and policies are hand-written **custom SQL
  migrations** (`drizzle-kit generate --custom`). A meta-test fails when any table lacks a classification or
  a tenant-scoped table lacks RLS/policy.
- **Rationale**: RLS is bypassed by superusers and `BYPASSRLS` roles (hosted providers' default owner roles
  typically have it), so a separate least-privilege runtime role is what actually makes isolation real; no
  password ever lands in a migration file; custom SQL for security objects is explicit, reviewable, and
  independent of ORM RLS API changes.
- **Alternatives**: one role for everything — RLS silently off in production. Declaring policies in Drizzle
  schema (`pgPolicy`) — API has been changing between releases; SQL is stable.

## 6. ORM and driver

- **Decision**: Drizzle ORM + `drizzle-kit`, `pg` (node-postgres) `Pool` (max 10, configurable later).
  PostgreSQL 16 is the minimum (CI uses 16; Neon/others may run newer). Primary keys are `uuid DEFAULT
  gen_random_uuid()` for Masari tables; auth tables keep the auth library's text IDs.
- **Rationale**: SQL-shaped, typed, transactions are first-class (needed for `withTenant`), migrations are
  plain SQL files; `pg` is the most battle-tested driver and works with every host and pooler.
- **Alternatives**: Prisma — good docs, but RLS needs client extensions and interactive transactions per
  query. Kysely — fine, no migration generator. Provider HTTP drivers (Neon serverless) — provider lock-in
  (constitution: portability).

## 7. Authentication library and exposure

- **Decision**: Better Auth 1.x with the Drizzle adapter (`usePlural: true` → tables `users`, `sessions`,
  `accounts`, `verifications`), email + password only, database sessions (7 days, refreshed daily, no cookie
  cache), `requireEmailVerification: true`, `sendOnSignUp: false`, `autoSignInAfterVerification: false`,
  password length 10–128, verification link 24 h, reset link 1 h, sessions revoked on password reset,
  `nextCookies()` plugin last. Extra user columns: `tenantId`, `locale`, `privacyConsentAt` (settable at
  creation) and `role`, `status` (`input: false`; never settable through the auth API).
  **All auth operations are invoked server-side through `auth.api.*` inside our Server Actions.** The HTTP
  handler `/api/auth/[...all]` is mounted behind an allow-list that serves only the link targets Better Auth
  puts in emails — `GET /api/auth/verify-email`, `GET /api/auth/reset-password/:token`, `GET
  /api/auth/error` — and answers 404 to everything else (including `POST /api/auth/sign-up/email` and
  `/sign-in/email`).
- **Rationale**: never hand-roll password/session logic (constitution III); Better Auth is the maintained
  TypeScript option with a Drizzle adapter and no hosted dependency (works on-premises). Closing the public
  sign-up/sign-in endpoints means there is exactly one code path per operation — ours — where college
  rules, enumeration-safety, rate limits, and audit are applied; nothing can be bypassed by calling the
  library endpoint directly.
- **Alternatives**: Supabase Auth / Clerk / Auth0 — hosted, per-user pricing or lock-in, awkward
  on-premises. Auth.js credentials provider — discouraged by its own docs for passwords. Better Auth
  `organization` plugin for tenants — brings multi-organisation sessions and owner semantics we do not want
  (one user = one college); its `admin` plugin is platform-global, not college-scoped.

## 8. Account creation flows and enumeration safety

- **Decision**: accounts are created only by two Server Actions. `registerStudentAction` validates the
  college and domain rule, then: existing account → send "account exists" email; pending invitation → send
  "use your invitation" email; otherwise `auth.api.signUpEmail` (role defaults to `student`) followed by an
  explicit `auth.api.sendVerificationEmail`. All three branches end with the same redirect to the "check
  your email" screen. `acceptInvitationAction` atomically claims the invitation, creates the user with the
  invitation's email and college, then sets the invited role and `email_verified = true`; any failure after
  the claim deletes the account it created and releases the claim. Invitations cannot be created for an email that already has an account, and
  self-registration is refused for an email with a pending invitation — together these close the
  "pre-register someone's email, then inherit their invited role" attack.
- **Rationale**: FR-005/FR-013/FR-020–023; one place for each rule.
- **Alternatives**: validating in Better Auth hooks while leaving its endpoints public — rules split between
  hooks and actions, harder to test, and hook signatures vary by version.

## 9. Rate limiting

- **Decision**: a small PostgreSQL-backed fixed-window limiter in `@masari/db` (`rate_limit_counters`,
  atomic upsert) applied in the public Server Actions with composite keys (per email **and** per IP) and the
  limits of FR-009. The client IP comes from `X-Forwarded-For` only as far as the deployment's own proxies
  vouch for it: `TRUSTED_PROXY_HOPS` (default 0 = header ignored) selects the entry counted from the right;
  anything else is `null` and shares one strict bucket (`contracts/http-and-env.md` §5). End-to-end tests
  send a distinct address per test through that same rule, so limits are never relaxed for tests. Expired
  counters are purged opportunistically by the limiter itself.
- **Rationale**: Better Auth's built-in limiter is IP-only and does not apply to server-side `auth.api`
  calls; IP-only limits would lock out a lecture hall behind one campus NAT, and too-generous IP limits do
  not stop guessing one account. A database table works on serverless and on-premises with no extra service.
  The first `X-Forwarded-For` entry is client-controlled behind any proxy that appends, so taking it would
  let an attacker choose a fresh bucket per request; counting from the right uses only proxy-written entries.
- **Alternatives**: Redis/Upstash limiter — new infrastructure (constitution VII). In-memory — useless on
  serverless and multi-instance.

## 10. How the college (tenant) is resolved

- **Decision**: from the signed-in user's `tenant_id`. Before sign-in the only tenant-specific step is
  student registration, which uses a college picker (preselected by `?u=<slug>` or when one active college
  exists). No sub-domain or path-based tenant routing.
- **Rationale**: one user belongs to one college, so the session already knows the tenant; no wildcard DNS,
  no host parsing, identical behaviour on localhost, free-tier hosting, and on-premises. Custom domains can
  later be added as an alias that preselects the college (feature 023) without changing data access.
- **Alternatives**: `college.masari.app` sub-domains — needs a paid domain + wildcard certificates for the
  pilot and special local setup. `/c/<slug>/…` paths — longer URLs and a second source of truth for the
  tenant that must be reconciled with the session on every request.

## 11. Authorisation

- **Decision**: a static role → permission matrix in `apps/web/src/server/auth/permissions.ts`
  (`can(role, permission)`), guards `requireSession(returnTo)` / `requirePermission(permission, returnTo)`
  for pages (redirect to sign-in, or `notFound()` when the role lacks the permission) and
  `getActionContext(permission?)` for Server Actions (returns a typed failure instead of redirecting). Every
  page and action calls a guard itself; a unit test scans the route tree and fails if a signed-in page has
  no guard call. `getSessionContext()` re-reads user and college status on every request, so suspension and
  role changes apply immediately.
- **Rationale**: FR-014/FR-015/FR-030/FR-031; layouts do not re-run on every navigation, so layout-only
  checks are insufficient; a tiny matrix is easier to audit than a policy engine.
- **Alternatives**: CASL/Casbin — unnecessary for 4 roles × 10 permissions. Proxy-based protection —
  explicitly rejected (§3).

## 12. Internationalisation

- **Decision**: next-intl 4 with a `[locale]` segment, locales `ar` (default) and `en`,
  `localePrefix: 'always'`, `localeDetection: false` (the bare `/` always goes to `/ar`). Messages in
  `apps/web/messages/{ar,en}.json`, namespaced by feature, typed via next-intl's `AppConfig` augmentation.
  Signed-in users' choice is stored in `users.locale` and applied by redirecting to `/{locale}/…` after
  sign-in. Formatting helpers force `numberingSystem: 'latn'`, Gregorian calendar, `Africa/Cairo`.
  `scripts/check-i18n.mjs` (key parity, no empty values, identical ICU arguments) and ESLint
  `react/jsx-no-literals` enforce completeness.
- **Rationale**: FR-036/037/041; deterministic Arabic-first behaviour regardless of browser language;
  compile-time and CI-time guarantees that both languages are complete.
- **Alternatives**: browser-language detection — an Egyptian student with an English-language phone would
  land in English, contradicting Arabic-first. Paraglide/Lingui — less App Router documentation.

## 13. RTL and Arabic typography

- **Decision**: `<html lang dir>` from the locale; Tailwind logical utilities only, enforced by
  `scripts/check-rtl.mjs`; shadcn/ui components are converted to logical utilities when added (use the CLI's
  RTL option if the pinned version has one; otherwise convert by hand — the check is the gate). Font: **IBM
  Plex Sans Arabic** (Arabic + Latin glyphs; weights 400/500/600/700) self-hosted through the
  `@fontsource/ibm-plex-sans-arabic` package's per-subset CSS (OFL-1.1), with a system fallback stack. Body
  line-height 1.7 for Arabic, no letter-spacing or italics on Arabic text, inputs ≥ 16 px, LTR fragments
  (`type=email|password|url|tel`, student codes, slugs) rendered with `dir="ltr"`.
- **Rationale**: FR-036, constitution IV; a single family covering both scripts keeps mixed text
  harmonious; fontsource needs no network at build time (cloud sandboxes block Google Fonts) and ships
  `unicode-range` subsets so English pages do not download Arabic glyphs.
- **Alternatives**: `next/font/google` — build-time download fails in restricted sandboxes. Cairo/Tajawal —
  good, more display-like; Noto Sans Arabic — larger files. The owner can swap the family by editing the
  tokens in `globals.css` and `DESIGN.md`.

## 14. UI components and forms

- **Decision**: Tailwind CSS 4 (`@theme` tokens in `globals.css`), shadcn/ui components copied into
  `apps/web/src/components/ui` only when first needed, lucide icons. Forms are plain `<form action>` +
  `useActionState`, server-validated with Zod, with a shared accessible `Field` wrapper
  (`label`/`aria-invalid`/`aria-describedby`/error text). No client form library, no client data-fetching
  library, no global client state.
- **Rationale**: forms work without JavaScript (edge case in spec), smallest client bundle (FR-043), one
  validation source.
- **Alternatives**: react-hook-form + client Zod — duplicate validation and more JS for simple forms; can be
  added later for a genuinely complex form.

## 15. Email

- **Decision**: Nodemailer. `EMAIL_TRANSPORT=smtp` (any provider) or `capture` (writes each message as a
  JSON file in `EMAIL_CAPTURE_DIR` and logs one line; forbidden when `APP_ENV=production`). Templates are
  TypeScript functions returning `{ subject, text, html }`, bilingual in one message (Arabic block `dir=rtl`
  first, English block `dir=ltr` second), all dynamic values HTML-escaped. Five templates: verify-email,
  account-exists, invitation-pending, reset-password, invitation.
- **Rationale**: FR-038; SMTP works with free tiers and on-premises relays; capture mode gives deterministic
  e2e tests and a zero-setup developer experience (FR-047).
- **Alternatives**: a provider SDK (Resend, SES) — lock-in; React Email — extra dependency for five simple
  messages; Mailpit container — not available in sandboxes without Docker.

## 16. Testing strategy

- **Decision**:
  - *Unit* (Vitest, co-located `*.test.ts` in `apps/web/src`): schemas, rules, permissions, module registry,
    formatters, email templates, env parsing, allow-list, guard-coverage scan.
  - *Integration* (Vitest in `packages/db/test`, real PostgreSQL): the suite's global setup drops and
    recreates database `masari_test` on the configured server, runs migrations, and ensures the runtime role;
    tests use the **runtime** role for assertions and the owner connection only for fixtures. Tests create
    their own tenants (random slugs) and never truncate.
  - *End-to-end* (Playwright, Chromium desktop + a Pixel-class mobile project, against `next build && next
    start` on port 3100 with database `masari_e2e`, `APP_ENV=test`, `EMAIL_TRANSPORT=capture`): black-box
    through the UI; emails are read from the capture directory; colleges are created through
    `@masari/db/admin` (the same code the operator CLI uses). No seeded passwords.
  - Auth flows that call Better Auth are verified end-to-end rather than with library mocks.
  - Coverage (v8): ≥ 80% lines for `packages/db/src` and for `apps/web/src/{server,lib,modules}` +
    `features/**/{schemas,rules}.ts`; `actions.ts`, components, and route files are excluded from the unit
    coverage denominator (they are covered by e2e).
- **Rationale**: constitution II; each layer proves what only it can prove; no mocks of the database or the
  auth library, which is where isolation and security bugs hide.
- **Alternatives**: PGlite/in-memory database for tests — different engine path for roles/RLS;
  Testcontainers — needs Docker, unavailable in cloud sandboxes (which do have PostgreSQL 16 installed).

## 17. CI and quality gates

- **Decision**: one GitHub Actions workflow `ci.yml` with jobs `quality` (format, lint, typecheck, i18n,
  RTL), `test` (PostgreSQL 16 service; unit + integration + coverage), `build`, `e2e` (PostgreSQL service;
  Playwright + axe + JS budget; report artefact on failure), `secrets` (gitleaks over full history of the
  PR), `audit` (`pnpm audit --prod --audit-level high`). Triggers: `pull_request` and `push` to `main`;
  in-progress runs for the same ref are cancelled; job timeout 15 min; `permissions: contents: read`.
  Dependabot updates npm weekly (grouped minor/patch) and actions monthly.
- **Rationale**: FR-046, SC-009; maps one-to-one to the constitution's eight gates.
- **JS budget**: an e2e spec sums the encoded size of all script responses on first load (Chromium DevTools
  protocol) for representative public and signed-in screens and asserts ≤ 200 KB / ≤ 300 KB. Deterministic
  for a given build — unlike timing-based lab metrics, which are measured manually once in the polish batch
  (Lighthouse mobile preset) and recorded in the PR.
- **Alternatives**: Lighthouse CI as a required gate — timing variance on shared runners causes flaky
  failures; revisit in feature 009.

## 18. Browser protections

- **Decision**: headers from `next.config.ts` on every response: CSP (`default-src 'self'`; `script-src
  'self' 'unsafe-inline'` plus `'unsafe-eval'` only in development; `style-src 'self' 'unsafe-inline'`;
  `img-src 'self' data: blob:`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Robots-Tag: noindex, nofollow`, and
  HSTS when `APP_URL` is https; `poweredByHeader: false`; `robots.ts` disallows everything.
- **Rationale**: FR-048/FR-049. A nonce-based CSP (removing `'unsafe-inline'` for scripts) forces every page
  dynamic through the proxy and is scheduled for feature 009 before payments exist.
- **Alternatives**: nonce CSP now — more moving parts in the foundation for little gain while no third-party
  content or payment exists.

## 19. Configuration

- **Decision**: one `.env` at the repository root (git-ignored; `.env.example` committed with placeholders
  and local-only development values). Package scripts load it with `dotenv-cli`
  (`dotenv -e ../../.env -- <cmd>`); real environments inject variables directly. `apps/web/src/server/env.ts`
  and `packages/db/src/env.ts` parse with Zod **lazily** (first use / server start, never at import) so
  `next build` needs no secrets. Production rules: `APP_URL` https, `EMAIL_TRANSPORT=smtp`,
  `BETTER_AUTH_SECRET` ≥ 32 chars; the web app never reads `DATABASE_MIGRATION_URL`.
- **Rationale**: one file for a student to edit; fail fast with a readable message; no secret needed to
  build.
- **Alternatives**: per-package `.env.local` files — two places to keep in sync; `@t3-oss/env` — extra
  dependency for ~30 lines.

## 20. Logging and audit

- **Decision**: `apps/web/src/server/log.ts` — a ~30-line JSON-lines logger over `console` with levels and
  an `event` name; `no-console` lint rule everywhere else. Audit events go to the tenant-scoped,
  append-only `audit_events` table (runtime role has `INSERT`/`SELECT` only) through
  `recordAudit(ctx, event, tx?)` — in the same transaction as the change whenever the change is made
  through `withTenant`; metadata is a small, schema-checked object of IDs and enumerations — never
  emails, names, tokens, or passwords. Failed sign-ins for unknown emails have no tenant and are logged (not
  audited) without the email.
- **Rationale**: FR-044; constitution III (logs without personal data).
- **Alternatives**: pino/winston — unnecessary now; external log service — feature 009.

## 21. Hosting

- **Decision**: nothing in this feature depends on a host. `docs/deployment.md` (polish batch) documents the
  pilot setup: Vercel project rooted at `apps/web` + Neon PostgreSQL (pooled connection string for
  `DATABASE_URL`, direct for `DATABASE_MIGRATION_URL`), migrations run from the owner's machine or a manual
  workflow, SMTP provider credentials set as environment variables by the owner. A production Docker image
  is built in feature 009.
- **Rationale**: creating accounts and secrets is the owner's task (constitution: roles); the code stays
  portable.
- **Alternatives**: building the Dockerfile now — not needed for the pilot; done once before on-prem demand.

## 22. Design system bootstrap

- **Decision**: the i18n/layout batch creates `PRODUCT.md` (who the users are, tone, "Operate" mode for
  app screens) and `DESIGN.md` (tokens: colour roles, type scale, spacing, radii, focus ring; RTL and
  Arabic typography rules) at the repository root for the Impeccable skill, and implements the tokens in
  `globals.css`. Constraints the reviewer checks: light theme only; AA contrast for every text/background
  token pair; visible 2 px focus ring; 44 px minimum touch targets; `prefers-reduced-motion` respected; calm,
  trustworthy, academic tone — no decorative gradients or stock imagery. Token *values* are the implementer's
  choice within these constraints; the owner can restyle later by editing tokens only.
- **Rationale**: gives UI batches a stable, reviewable base without the architect dictating taste.

## 23. Identifiers, time, text normalisation

- **Decision**: timestamps are `timestamptz` (UTC) and displayed in `Africa/Cairo`. Emails are trimmed and
  lower-cased before any comparison or storage. Student codes and division codes are trimmed; division
  codes upper-cased. Search terms escape `%`, `_`, and `\` before `ILIKE`. Invitation tokens are 32 random
  bytes, base64url, stored only as SHA-256 hex.
- **Rationale**: avoids duplicate accounts by letter case and injection through search patterns; a leaked
  database does not leak usable invitation links.

## 24. Pinned versions (filled by T001)

Majors are binding. T001 installs the latest stable release within each major, records the exact version
here, and from then on versions change only through reviewed PRs (Dependabot or manual).

| Package | Major (binding) | Exact version (T001 fills) |
|---|---|---|
| node (`.nvmrc`) | 24 (min 22) | `.nvmrc` = `24` (latest 24.x LTS); PR-1 verified locally on 22.23.4 |
| pnpm | 10 | 10.28.0 (`packageManager`) |
| typescript | 5 (≥ 5.9) or the major required by the pinned Next.js | 5.9.3 |
| next / react / react-dom | 16 / 19 / 19 | 16.4.6 / 19.3.1 / 19.3.1 (@types/react, @types/react-dom 19.3.0; @types/node 24.19.2) |
| tailwindcss | 4 | 4.3.5 (+ @tailwindcss/postcss 4.3.5, pinned exactly) |
| next-intl | 4 | 4.15.1 (+ use-intl 4.15.1) |
| better-auth | 1 | |
| drizzle-orm / drizzle-kit | latest stable pair | 0.45.4 / 0.31.11 |
| pg | 8 | 8.23.1 (+ @types/pg 8.23.1; also a `@masari/web` dependency since PR-9 so Next.js can keep it external — never imported by `apps/web/src`) |
| zod | 4 | 4.6.7 (`@masari/db`; `@masari/web` since PR-9) |
| nodemailer | latest stable | 10.6.0 (+ @types/nodemailer 8.0.2; `@masari/web`, PR-11) |
| vitest / @vitest/coverage-v8 | latest stable (≥ 3) | 4.1.12 / 4.1.12 |
| @playwright/test / @axe-core/playwright | 1 / 4 | 1.63.0 (exact pin: matches the Chromium build CI installs) / 4.14.0 |
| eslint / typescript-eslint / eslint-config-next | latest supported by eslint-config-next 16 | 9.39.5 (+ @eslint/js 9.39.5) / 8.73.0 / 16.4.6 |
| prettier / prettier-plugin-tailwindcss | 3 / latest | 3.10.1 / 0.7.4 |
| tsx / dotenv-cli | latest stable | 4.23.15 / 8.0.0 (dotenv-cli also a `@masari/web` devDependency since PR-9; tsx since PR-10) |
| @fontsource/ibm-plex-sans-arabic / lucide-react | latest stable | 5.3.0 / (not installed yet) |
| clsx / tailwind-merge / class-variance-authority / @radix-ui/react-slot (shadcn/ui, PR-8) | latest stable | 2.1.1 / 3.7.0 / 0.7.1 / 1.5.0 |

If a newer major of a "binding" package is already stable at T001, stay on the major listed here and
mention it in the PR; upgrading a major is a separate, reviewed decision.

Rows left empty are filled by the batch that first installs the package (exact versions then come from
`pnpm-lock.yaml`).

## 25. Summary of decisions the owner should know

1. Tenant = college; one user = one college; tenant comes from the session (no sub-domains) — §4, §10.
2. Two database roles are mandatory; the app refuses to start with a role that can bypass RLS — §5.
3. Public sign-up/sign-in library endpoints are closed; everything goes through our Server Actions — §7.
4. Registration never reveals whether an email exists; staff roles only by invitation — §8.
5. Rate limits are per email and per IP with campus-NAT-friendly numbers — §9.
6. Arabic is always the default regardless of browser language; Western digits — §12.
7. Font: IBM Plex Sans Arabic, self-hosted — §13.
8. Baseline CSP now, nonce-based CSP and breached-password check in feature 009 — §18.
9. Pilot hosting (Vercel + Neon + an SMTP provider) needs accounts and secrets created by the owner — §21.
10. Library versions and API names could not be verified online during planning — see the caveat at the top.
