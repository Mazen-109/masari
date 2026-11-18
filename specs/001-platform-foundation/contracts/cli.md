# Contract: Commands (developer and operator)

**Feature**: `001-platform-foundation` · Root `package.json` scripts; all run from the repository root

Scripts that need the database load the root `.env` through `dotenv-cli` and use variables already present
in the environment when there is no `.env` (CI, production).

## 1. Root scripts

| Script | Runs | Notes |
|---|---|---|
| `pnpm dev` | `pnpm --filter @masari/web dev` | Next.js dev server on port 3000 |
| `pnpm build` | `pnpm --filter @masari/web build` | Needs no environment variables |
| `pnpm start` | `pnpm --filter @masari/web start` | Serves the production build |
| `pnpm lint` | `eslint . --max-warnings 0` | Root flat config covers all packages |
| `pnpm format` / `pnpm format:check` | `prettier --write .` / `prettier --check .` | |
| `pnpm typecheck` | `pnpm -r typecheck` | each package: `tsc --noEmit` |
| `pnpm test` | `pnpm -r test` → `pnpm test:scripts` | each package: `vitest run --coverage`; needs PostgreSQL for `@masari/db`. `test:scripts` = `node --test "scripts/*.test.mjs"` (repository scripts, e.g. the i18n gate) |
| `pnpm test:e2e` | `pnpm --filter @masari/web test:e2e` | `next build` → prepare database `masari_e2e` (`ci.md` §3) → `playwright test`; needs PostgreSQL |
| `pnpm i18n:check` | `node scripts/check-i18n.mjs` | exit 1 on invalid JSON (naming the file), duplicate keys, keys that are empty or contain `.`, any difference between `ar.json` and `en.json` (keys, message vs group), empty values, invalid ICU messages (`plural`/`select`/`selectordinal` must have `other`), differing ICU arguments or tags, and ICU number/date/time formatting or `#` (FR-041: pass values pre-formatted with `lib/format`) |
| `pnpm rtl:check` | `node scripts/check-rtl.mjs` | exit 1 on physical-direction utilities in `apps/web/src/**/*.{ts,tsx,css}` |
| `pnpm check` | `format:check` → `lint` → `typecheck` → `i18n:check` → `rtl:check` → `test` | local pre-PR gate |
| `pnpm db:up` / `pnpm db:down` | `docker compose up -d --wait postgres` / `docker compose down` | local PostgreSQL 16 |
| `pnpm db:generate` | `pnpm --filter @masari/db generate` | `drizzle-kit generate`; pass `--custom --name <name>` for hand-written SQL |
| `pnpm db:migrate` | `pnpm --filter @masari/db migrate` | see §2 |
| `pnpm db:seed` | `pnpm --filter @masari/db seed` | see §3 |
| `pnpm tenant:create` | `pnpm --filter @masari/db tenant:create` | see §4 |
| `pnpm tenant:set-status` | `pnpm --filter @masari/db tenant:set-status` | see §5 |

`scripts/check-rtl.mjs` forbidden patterns. Matching is per class token (text delimited by whitespace,
quotes, or backticks) after stripping variant prefixes (`md:`, `hover:`, …) and a leading `!` or `-`; the
whole remaining token must match one of:

- `^(ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-.+$`
- `^(text|float|clear|origin)-(left|right)$`
- `^rounded-(l|r|tl|tr|bl|br)(-.+)?$` and `^border-(l|r)(-.+)?$` — the side must be followed by `-` or the
  end of the token, so `rounded-l-lg`, `rounded-tl`, `border-r`, `border-l-2` are flagged while `rounded-lg`,
  `border-ring`, `border-red-500` are not. `-ml-2` and `md:pl-4` are flagged (prefix stripping).

Also forbidden: CSS declarations `margin-left|right`, `padding-left|right`, `left:`, `right:`,
`text-align: left|right`. A line containing the comment marker `rtl-ok:` followed by a reason is exempt.
Output: `file:line: <match> → use <logical equivalent>`.

## 2. `pnpm db:migrate` — `packages/db/scripts/migrate.ts`

Input: `DATABASE_MIGRATION_URL`, `DATABASE_URL`.

1. Apply all pending migrations in `packages/db/migrations` using the owner connection.
2. `ensureRuntimeRole` for the role named in `DATABASE_URL`.
3. Print `Migrations applied: <n>` and `Runtime role ready: <role name>`; exit 0.

Idempotent. Exit 1 with a one-line reason on failure (never prints a connection string or password).

## 3. `pnpm db:seed` — `packages/db/scripts/seed.ts`

Runs `seedDemo` (data in `data-model.md` §5). Idempotent: running twice changes nothing. Prints the demo
college slug and, when an administrator invitation was created (from PR-26), the line
`Admin invitation link: <APP_URL>/ar/invite/<token>`. Fails closed: runs only when `APP_ENV` is explicitly
`development` or `test` (read through `getAdminDbEnv()`); when it is `production` or not set, it prints
`Refusing to seed demo data: APP_ENV is <value|not set>; it must be development or test. Nothing was changed.`
and exits 1 without connecting to the database. `APP_URL` is required (the invitation link is built from it
and the token is never stored in plain form): when `APP_ENV` allows seeding but `APP_URL` is not set, it
prints `APP_URL is not set; it is needed for the admin invitation link. Nothing was changed.` and exits 1
without connecting to the database. Any other failure prints `Seed failed: <reason>` (a PostgreSQL error is
reduced to `database error <SQLSTATE>`; never a connection string) and exits 1.

## 4. `pnpm tenant:create` — `packages/db/scripts/tenant-create.ts` (FR-018)

```text
pnpm tenant:create --slug <slug> --name-ar "<Arabic name>" --name-en "<English name>" --admin-email <email>
```

| Outcome | Exit | Output |
|---|---|---|
| Created | 0 | `College created: <slug>` and `Admin invitation link (valid 7 days): <APP_URL>/ar/invite/<token>` |
| Missing/invalid argument (slug pattern, name length 1–120, email) | 2 | usage + which argument is invalid |
| Slug already used | 1 | `A college with slug "<slug>" already exists. Nothing was changed.` |
| Email already has an account | 1 | `This email already has an account. Nothing was changed.` (the college is not created) |
| `APP_URL` not set | 1 | `APP_URL is not set; … Nothing was changed.` (checked before connecting; also applies to `db:seed`) |
| Unexpected error | 1 | `Creating the college failed: <reason>. Nothing was changed.` — database errors are reduced to `database error <SQLSTATE>`, never the server's message |

Creation of the college, its `GEN` division, and the invitation happens in one transaction: the script calls
`createTenantWithAdmin` (`db-api.md` §3), not `createTenant` + `createAdminInvitation` separately. The
invitation link is printed once and never stored in plain form.

## 5. `pnpm tenant:set-status` — `packages/db/scripts/tenant-set-status.ts` (FR-018, FR-019)

```text
pnpm tenant:set-status --slug <slug> --status active|suspended
```

Exit 0 with `College <slug> is now <status>`; exit 1 with `College not found`; exit 2 on invalid arguments
(including a malformed slug); unexpected error → exit 1 with `Changing the college status failed: <reason>`
(database errors reduced to `database error <SQLSTATE>`).
Suspending does **not** delete sessions: every request re-checks the college status (`permissions.md` §3),
so existing sessions are refused with the "college suspended" reason while the college is suspended and work
again after reactivation (until they expire normally).

## 6. Argument parsing

Use `node:util` `parseArgs` (no CLI library). Unknown options → exit 2 with usage.
