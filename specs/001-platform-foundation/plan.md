# Implementation Plan: Platform Foundation

**Branch**: `001-platform-foundation` (one branch + PR per batch: `001-prNN-slug`) | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-platform-foundation/spec.md`

**Note**: Produced by following `.claude/skills/speckit-plan/SKILL.md` by hand. Phase 0 output:
[research.md](./research.md). Phase 1 outputs: [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Phase 2 output: [tasks.md](./tasks.md).

## Summary

Deliver the base every Masari module needs: a pnpm monorepo with one Next.js 16 application (`apps/web`)
and one database package (`packages/db`); CI enforcing the constitution's eight gates; PostgreSQL with
row-level-security tenant isolation where a tenant is a college; email + password accounts (Better Auth)
with email confirmation, password recovery, and invitations; four roles enforced server-side through a
static permission matrix; the shared student academic profile; college settings, divisions, and per-college
module switches; an Arabic-first RTL shell with English; an append-only audit log; and operator commands to
onboard and suspend colleges.

Technical approach (details in research.md): all mutations are Server Actions returning a typed
`ActionResult`; all data access goes through `@masari/db` repositories inside `withTenant(...)`, which sets
a transaction-local tenant context that RLS policies check; the web app connects with a least-privilege role
and refuses to start otherwise; the auth library is called only server-side and its public sign-up/sign-in
endpoints are closed; rate limits are per email and per IP in a database table; tests are unit (Vitest),
integration against real PostgreSQL, and black-box end-to-end (Playwright + axe) with captured emails.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUncheckedIndexedAccess`) on Node.js 24 LTS (minimum 22)

**Primary Dependencies**: Next.js 16 (App Router, React 19), Tailwind CSS 4, shadcn/ui (copied components),
next-intl 4, Better Auth 1.x, Drizzle ORM + drizzle-kit, `pg`, Zod 4, Nodemailer, lucide-react,
`@fontsource/ibm-plex-sans-arabic`; dev: tsx, dotenv-cli

**Storage**: PostgreSQL 16+ (row-level security, two roles: owner for migrations, least-privilege runtime role)

**Testing**: Vitest (unit; integration against real PostgreSQL), Playwright + `@axe-core/playwright`
(end-to-end, accessibility, script budget)

**Target Platform**: Modern mobile and desktop browsers (last 2 years); server on Node.js — Vercel + Neon
for the pilot, any Node host / container + PostgreSQL otherwise

**Project Type**: web application — pnpm monorepo, modular monolith (`apps/web`) + database package (`packages/db`)

**Performance Goals**: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (p75, mid-range Android on 4G); server work
≤ 500 ms p95 per interactive request at 500 concurrent users per college

**Constraints**: first-load script ≤ 200 KB (public) / ≤ 300 KB (signed-in), CI-enforced; WCAG 2.1 AA in
both locales; Arabic RTL default; zero cross-tenant access; no secrets in the repository; no
provider-specific runtime APIs; `next build` needs no environment variables

**Scale/Scope**: pilot = 1 college, ≤ 5,000 users; design for tens of colleges. This feature: 18 screens,
20 Server Actions, 10 tables, 5 email templates, 5 operator/developer commands, 38 PR batches

No `NEEDS CLARIFICATION` remains (see research.md; unverifiable library details are covered by the
"Implementation latitude" rule below).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.2.0 (re-run on 2026-11-16 after principles VIII–XII
were added).

| Principle | Gate | How this plan satisfies it | Status |
|---|---|---|---|
| I. Code quality | Strict TS; lint/format/typecheck clean; feature-first layout; Zod at boundaries; DB only via `@masari/db`; permissive licences | `tsconfig.base.json` strict; ESLint flat config with `no-restricted-imports` enforcing the layer rules; every action validates with Zod; all dependencies MIT/Apache/ISC/OFL | ✅ |
| II. Testing | Tests in the same PR; real PostgreSQL; isolation test per tenant table; allow + deny test per permission; ≥ 80% coverage; deterministic | Each batch in tasks.md contains its tests; `packages/db/test/*.int.test.ts` list in contracts/db-api.md §4; permission matrix unit test (40 cells) + RBAC e2e matrix — "role permissions" is the one critical path of principle II that this feature delivers; every acceptance scenario maps to an e2e spec or to a manual check in quickstart.md / tasks.md "Requirement coverage"; coverage thresholds in contracts/ci.md §4; emails captured to files, no network | ✅ |
| III. Security & privacy | RLS enabled+forced with tenant context; safe runtime role; four roles, deny-by-default server-side authorisation; auth library; rate limits; no enumeration; no secrets; data minimisation; clean logs; audit; consent; a student sees what is held about them; headers/CSP | data-model.md §1–2; `assertSafeRuntimeRole` at start-up; guards + guard-coverage test; Better Auth with closed public endpoints; FR-009 limiter with a trusted-proxy rule for the client address (contracts/http-and-env.md §5); registration/recovery flows in contracts/server-actions.md §4; `.env.example` placeholders + gitleaks; only name/email/student code/level/division collected, all of it shown to the user on the profile screen; log contract; `audit_events`; consent timestamp; contracts/http-and-env.md §2. OWASP Top 10 testing before a real college uses it is roadmap feature 009 | ✅ |
| IV. Arabic-first | `ar` default RTL + `en`; both catalogs in the same PR; logical utilities; LTR isolation; Western digits; bilingual emails | next-intl with `localeDetection: false`; `i18n:check`, `rtl:check`, `react/jsx-no-literals`; format helpers; contracts/emails.md | ✅ |
| V. Accessibility | WCAG 2.1 AA; axe on every screen; keyboard-complete; labelled controls | contracts/routes.md §7; `a11y.spec.ts` lists grow per batch; keyboard e2e in the shell and form specs | ✅ |
| VI. Performance | Script budget in CI; server-first; pagination 20; no blocking long work | `perf-budget.spec.ts`; Server Components by default, no client data library; `users.listInTenant` paginated; no long-running work in this feature | ✅ |
| VII. Simplicity | One app + one database; extra packages/services justified | Two workspace packages, no queue/cache/extra service; no form or state library; items that add structure are justified below | ✅ (see Complexity Tracking) |
| VIII. Payment & paid-content integrity | Codes, payments, receipts, watermarks | No payment or paid content in this feature. It delivers what Kitabi (004) builds on: the append-only audit log (runtime role cannot update or delete), the four roles, and student identity (name + student code) for watermarks | ✅ (not applicable) |
| IX. Shared profile | One student profile; documented contracts between modules; modules degrade gracefully; college content is data | `student_profiles` is the first part of the shared profile and the only place level/division live; later features extend it with their own tables keyed by `(tenant_id, user_id)` (data-model.md §3.6). Module placeholders are independent and per-college switchable; divisions, levels, domains, and module switches are data edited by the college | ✅ |
| X. Human review | No automatic penalties; faculty review of AI output | No automated decision about a student exists here: suspension and role changes are explicit administrator actions, audited | ✅ (not applicable) |
| XI. Grounded AI | Citations, fallbacks, code-generated drawings | No AI in this feature | ✅ (not applicable) |
| XII. Phased scope | Follow the spec's priority order | This feature is phase 1 (foundation: accounts, roles and permissions, shared database); modules appear only as "coming soon" placeholders | ✅ |
| Stack table | Use exactly the fixed stack | Technical Context matches; no deviation | ✅ |
| Workflow | One PR per batch; gates; review; merge rule | tasks.md is organised as PR-1 … PR-38; contracts/ci.md implements gates 1–8 | ✅ |

**Post-design re-check (after Phase 1)**: no new violations. One documented exception to "every
college-owned table is under RLS": the auth-library table `users` carries `tenant_id` but is not under RLS
because sign-in must find a user before a tenant is known. It is recorded in Complexity Tracking with its
compensating controls. One deviation from principle I is recorded there as well: role and database DDL in
the two owner-only admin functions cannot use bound parameters and uses validated, escaped identifiers
instead. There are no others.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── spec.md
├── plan.md                  # this file
├── research.md              # Phase 0 — decisions and rationale
├── data-model.md            # Phase 1 — tables, constraints, RLS, grants, audit catalogue
├── quickstart.md            # Phase 1 — run and validate locally
├── contracts/
│   ├── routes.md            # URL map, guards, shell, a11y contract, message namespaces
│   ├── server-actions.md    # ActionResult, validation rules, every action's behaviour
│   ├── permissions.md       # roles, permission matrix, session context, module registry
│   ├── db-api.md            # @masari/db public API + required integration tests
│   ├── http-and-env.md      # route handlers, response headers, environment variables, logging
│   ├── emails.md            # transports, templates, e2e helpers
│   ├── cli.md               # root scripts and operator commands
│   └── ci.md                # workflow jobs, test databases, coverage, a11y and script budgets
├── checklists/requirements.md
└── tasks.md                 # Phase 2 — PR batches
```

### Source Code (repository root)

```text
.
├── .github/
│   ├── workflows/ci.yml
│   ├── dependabot.yml
│   └── pull_request_template.md
├── .editorconfig  .nvmrc  .npmrc  .prettierrc.json  .prettierignore  .gitleaks.toml  .env.example
├── docker-compose.yml               # PostgreSQL 16 for local development
├── eslint.config.mjs                # one flat config for the workspace
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
├── README.md  PRODUCT.md  DESIGN.md
├── scripts/
│   ├── check-i18n.mjs
│   └── check-rtl.mjs
├── docs/
│   ├── repo-settings.md             # owner checklist (branch protection)
│   └── deployment.md                # pilot deployment guide
├── apps/web/                        # @masari/web
│   ├── package.json  next.config.ts  tsconfig.json  postcss.config.mjs  components.json
│   ├── vitest.config.ts  playwright.config.ts
│   ├── messages/{ar,en}.json
│   ├── e2e/
│   │   ├── support/{prepare-db,global-setup,fixtures,axe,emails,flows,db,forge,operator,roles}.ts
│   │   └── {locale,a11y,perf-budget,register,auth,shell,profile,password-reset,
│   │        health,auth-endpoints,email-confirmation,college-onboarding,invitations,rbac,admin-users,
│   │        admin-settings,admin-divisions,security-headers}.spec.ts
│   └── src/
│       ├── proxy.ts                 # locale routing + page CSP nonce only
│       ├── instrumentation.ts       # env validation + assertSafeRuntimeRole at start-up
│       ├── app/
│       │   ├── globals.css  robots.ts  not-found.tsx  guard-coverage.test.ts
│       │   ├── api/health/route.ts
│       │   ├── api/auth/[...all]/route.ts
│       │   └── [locale]/
│       │       ├── layout.tsx  page.tsx  not-found.tsx  error.tsx
│       │       ├── (public)/layout.tsx
│       │       ├── (public)/{sign-in,register,verify-email,email-verified,forgot-password,
│       │       │             reset-password,privacy}/page.tsx
│       │       ├── (public)/invite/[token]/page.tsx
│       │       ├── (onboarding)/layout.tsx
│       │       ├── (onboarding)/onboarding/page.tsx
│       │       ├── (app)/layout.tsx  (app)/not-found.tsx
│       │       ├── (app)/{dashboard,profile}/page.tsx
│       │       ├── (app)/modules/[moduleKey]/page.tsx
│       │       └── (app)/admin/{users,invitations,divisions,settings}/page.tsx
│       ├── components/
│       │   ├── ui/                  # shadcn/ui components, added when first used
│       │   ├── forms/{field,form-error,submit-button}.tsx
│       │   └── shell/{skip-link,locale-switcher,public-header,app-header,app-sidebar,mobile-nav,
│       │              user-menu}.tsx + nav-items.ts
│       ├── features/
│       │   ├── auth/{schemas,rules,actions}.ts + components/
│       │   ├── profile/{schemas,rules,actions}.ts + components/
│       │   ├── dashboard/components/
│       │   ├── invitations/{schemas,actions}.ts + components/
│       │   ├── admin-users/{schemas,rules,actions}.ts + components/
│       │   ├── tenant-settings/{schemas,rules,actions}.ts + components/
│       │   └── divisions/{schemas,actions}.ts + components/
│       ├── i18n/{routing,request,navigation}.ts + types.d.ts
│       ├── lib/{result,format,locale,safe-next,utils}.ts
│       ├── modules/registry.ts
│       └── server/
│           ├── env.ts  log.ts  request.ts  audit.ts  rate-limit.ts
│           ├── auth/{auth,allowed-paths,permissions,session,action-context,invitation-lookup}.ts
│           └── email/{transport,send}.ts + templates/{layout,verify-email,account-exists,
│                      invitation-pending,reset-password,invitation}.ts
└── packages/db/                     # @masari/db
    ├── package.json  tsconfig.json  drizzle.config.ts  vitest.config.ts
    ├── migrations/                  # generated + custom SQL (forward-only)
    ├── scripts/{migrate,seed,tenant-create,tenant-set-status}.ts
    ├── src/
    │   ├── index.ts  auth.ts  admin.ts          # the three entry points
    │   ├── env.ts  client.ts  context.ts  safety.ts  constants.ts  tokens.ts  rate-limit.ts
    │   ├── table-classification.ts
    │   ├── schema/{index,tenants,auth,divisions,audit-events,rate-limit-counters,
    │   │           student-profiles,invitations}.ts
    │   ├── repositories/{tenants,users,sessions,divisions,student-profiles,invitations,audit}.ts
    │   └── admin/{migrate,database,tenants,seed,test-support}.ts
    └── test/{global-setup,helpers}.ts + *.int.test.ts
```

Unit tests are co-located (`foo.ts` → `foo.test.ts`). Integration tests live in `packages/db/test`.
End-to-end tests live in `apps/web/e2e`.

**Structure Decision**: web application as a two-package pnpm workspace — `apps/web` (UI, Server Actions,
auth, email) and `packages/db` (everything that touches PostgreSQL). Dependency direction:
`app routes → features → server/lib → @masari/db`; enforced by ESLint `no-restricted-imports`
(`pg`/`drizzle-orm` forbidden in `apps/web/src`; `@masari/db/admin` forbidden in `apps/web/src`;
`@masari/db/auth` allowed only in `server/auth/auth.ts`; `features/*` may not import another feature's
`actions.ts`).

### Layering rules inside `apps/web/src`

| Layer | May import | Must not |
|---|---|---|
| `app/**` (routes) | features, components, server, lib, i18n, modules | contain business rules or SQL |
| `features/<f>/actions.ts` | own `schemas`/`rules`, `server/**`, `lib/**`, `@masari/db` | be imported by other features; return untranslated text |
| `features/<f>/{schemas,rules}.ts` | `lib/**`, `@masari/db` constants/types only | touch the database, session, or Next.js APIs (must stay unit-testable) |
| `features/<f>/components/**` | `components/**`, own actions, `lib/**`, i18n | import `server/**` or `@masari/db` (types excepted) |
| `server/**` | `@masari/db`, `lib/**` | import from `features/**` or `app/**` |

### Request lifecycle (reference for every batch)

1. `proxy.ts` resolves the locale (redirects `/` → `/ar`) and sets the page CSP with a per-request nonce (contracts/http-and-env.md §2); nothing else.
2. A page calls `requireSession(returnTo)` or `requirePermission(permission, returnTo)`; these call the
   cached `getSessionContext()` (auth library session → fresh user + college rows → status checks).
3. The page reads data with `withTenant({ tenantId, userId }, tx => repository(tx, …))` and renders.
4. A form posts to a Server Action: `getActionContext` → Zod → rate limit (public) → rules +
   repositories in `withTenant`, with `recordAudit(ctx, event, tx)` in the same transaction →
   `revalidatePath` → `ActionResult` or `redirect`.

### Implementation latitude (binding rule for the implementer)

- **Binding**: spec.md, data-model.md, every file in contracts/, the file paths in tasks.md, and each
  batch's acceptance checks.
- **Not binding**: internal helper names not listed in contracts, visual styling within `DESIGN.md`
  constraints, and the exact library calls used to obtain a specified behaviour.
- If the pinned version of a library does not offer an option named in research.md, implement the same
  observable behaviour with the documented equivalent and describe it under **Spec deviation** in the PR.
- If a binding item cannot be met, stop and report instead of improvising.

## Complexity Tracking

> Items that add structure beyond the simplest possible design, with the reason each is accepted.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two database roles (owner + runtime) and RLS on every tenant-scoped table | Makes cross-college leaks impossible by construction (constitution III) even when a query forgets its filter | A single role bypasses RLS on hosted PostgreSQL; application-only filtering is one bug away from a leak |
| Second workspace package `packages/db` | Enforceable boundary around all SQL and tenant context; testable without Next.js; reusable by later worker processes | A folder inside the app cannot be protected by package `exports`, and later workers would import from the web app |
| `users` (auth-library table) carries `tenant_id` but is not under RLS | The auth library must look up users/sessions before a tenant is known | RLS here would require a privileged bypass path for the library, which is weaker than the chosen controls: only `repositories/users.ts`/`sessions.ts` query it, every scoped function takes `tenantId`, cross-college tests, raw handle not importable by the app |
| Own rate limiter (one table, ~40 lines) instead of the auth library's | Per-email + per-IP keys (campus NAT) and coverage of server-side auth calls | The library's limiter is IP-only and does not apply to `auth.api` calls |
| Auth HTTP handler mounted behind an allow-list | Emails must link to the library's verification/reset endpoints | Fully public handler would expose sign-up/sign-in endpoints that bypass college rules, rate limits, and audit |
| Custom SQL migrations for roles, grants, and policies next to generated ones | Security objects must be explicit and reviewable | ORM-level policy declarations change between ORM releases |
| **Deviation from principle I ("raw SQL only with parameter binding")**: `ensureRuntimeRole` and `recreateDatabase` in `@masari/db/admin` interpolate a role name, a database name, and a password into DDL | PostgreSQL does not accept bound parameters in `CREATE/ALTER ROLE`, `GRANT`, `CREATE/DROP DATABASE` | There is no parameterised form. Controls (contracts/db-api.md §3): names validated against a strict pattern before any SQL is sent, identifiers through the driver's `escapeIdentifier`, the password through `escapeLiteral`, only these two owner-connection functions, unit-tested; never reachable from the web app |
