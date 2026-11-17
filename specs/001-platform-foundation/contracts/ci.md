# Contract: Continuous Integration

**Feature**: `001-platform-foundation` · File: `.github/workflows/ci.yml` · Implements FR-046, SC-009 and the
constitution's eight required gates

## 1. Workflow

- **Triggers**: `pull_request` (all branches) and `push` to `main`.
- **Concurrency**: group `ci-${{ github.ref }}`, `cancel-in-progress: true`.
- **Permissions**: `contents: read` at workflow level.
- **Every job**: `runs-on: ubuntu-latest`, `timeout-minutes: 15`, checkout, pnpm setup (version from
  `packageManager`), Node from `.nvmrc` with pnpm cache, `pnpm install --frozen-lockfile`.
- Third-party actions are referenced by major version tag and kept current by Dependabot.
- No job may use `continue-on-error`, and no step may be conditionally skipped on pull requests.

## 2. Jobs (each is a required status check from the batch that adds it)

| Job id | Constitution gate | Steps | Added in |
|---|---|---|---|
| `quality` | 1, 2, 3 | `pnpm format:check` → `pnpm lint` → `pnpm typecheck` → `pnpm i18n:check` → `pnpm rtl:check` (`i18n:check` from PR-7, `rtl:check` from PR-8) | PR-2 |
| `test` | 4 | PostgreSQL service → `pnpm test` (coverage thresholds enforced by Vitest config) | PR-2 (service used from PR-3) |
| `build` | 5 | `pnpm build` with **no** application environment variables set | PR-2 |
| `e2e` | 6 | PostgreSQL service → `pnpm --filter @masari/web exec playwright install --with-deps chromium` → `pnpm test:e2e`; on failure upload `apps/web/playwright-report` as an artifact (7 days) | PR-10 |
| `secrets` | 7 | checkout with `fetch-depth: 0` → gitleaks (config `.gitleaks.toml`) | PR-2 |
| `audit` | 8 | `pnpm audit --prod --audit-level high` | PR-2 |

**Required checks and their start date.** A job can be marked "required" in branch protection only once it
exists on `main`: a required check that never reports blocks every pull request. The owner therefore marks
`quality`, `test`, `build`, `secrets`, and `audit` as required after PR-2 is merged, and adds `e2e` only
after PR-10 is merged (`docs/repo-settings.md` says this explicitly). Until then PR-3…PR-9 have no `e2e`
job to wait for; from PR-10 on it is required like the others.

**Duration of `e2e`.** The 15-minute job timeout is also SC-009's budget and is not raised. Every PR from
PR-10 on states the `e2e` job's duration. In the first batch where it exceeds 10 minutes, that batch splits
the job: `e2e-shard` with `strategy.matrix.shard: [1, 2]` runs
`pnpm test:e2e -- --shard=${{ matrix.shard }}/2` (each shard with its own PostgreSQL service), and a final
job named `e2e` `needs: e2e-shard` and fails unless every shard succeeded — the required check name stays
`e2e`. Add a third shard the same way if needed. Sharding runs every test; it does not weaken the gate.

**When `audit` fails because of an upstream advisory** (a high-severity advisory published against a
dependency already on `main`, unrelated to the batch):

1. A fixed version exists → a separate dependency PR (`chore(deps): …`, outside the batch sequence, same
   review and merge rule) updates it — directly, or through `pnpm.overrides` for a transitive dependency —
   and is merged first; the batch then rebases.
2. No fixed version exists → the implementer does not add an ignore entry and does not change the audit
   command. The orchestrator stops and asks the owner, with the advisory id, the affected package, and
   whether Masari's code reaches the vulnerable path. The owner chooses between waiting for the fix,
   replacing the dependency, or amending the constitution to allow a recorded, time-boxed exception.

PostgreSQL service (jobs `test`, `e2e`): image `postgres:16-alpine`, `POSTGRES_USER=masari_owner`,
`POSTGRES_PASSWORD=masari_dev_owner`, `POSTGRES_DB=masari`, port `5432:5432`, health check `pg_isready`.

Job environment (jobs `test`, `e2e`) — CI-only throwaway values, identical to `.env.example`:

```yaml
APP_ENV: test
APP_URL: http://localhost:3100
DATABASE_URL: postgres://masari_web:masari_dev_web@localhost:5432/masari
DATABASE_MIGRATION_URL: postgres://masari_owner:masari_dev_owner@localhost:5432/masari
BETTER_AUTH_SECRET: ci-only-secret-not-used-anywhere-else-000000
EMAIL_TRANSPORT: capture
EMAIL_FROM: "Masari <no-reply@localhost>"
```

The repository needs **no GitHub secrets** for this feature.

## 3. Test databases

- `pnpm test` (`packages/db/vitest.config.ts`): global setup calls
  `recreateDatabase(MIGRATION_URL, DATABASE_URL, 'masari_test')`; the config sets the test workers'
  `DATABASE_URL` / `DATABASE_MIGRATION_URL` to the `masari_test` database via `withDatabaseName`.
- `pnpm test:e2e` (`apps/web/package.json`) runs three steps in order, stopping at the first failure:
  1. `next build`;
  2. `tsx e2e/support/prepare-db.ts` — `recreateDatabase(MIGRATION_URL, DATABASE_URL, 'masari_e2e')` then
     `seedDemo` on that database (URLs from `getAdminDbEnv()` and `withDatabaseName`, both exported by
     `@masari/db/admin`);
  3. `playwright test`.

  The database MUST exist before Playwright starts: Playwright launches `webServer` **before** `globalSetup`,
  and the server exits at start-up when `assertSafeRuntimeRole()` cannot connect (`http-and-env.md` §3).
  Global setup (`e2e/support/global-setup.ts`) therefore only empties the email capture directory.
  `webServer` (`apps/web/playwright.config.ts`) runs `pnpm start` on port 3100 with `DATABASE_URL` pointing
  at `masari_e2e`, `APP_ENV=test`, `EMAIL_TRANSPORT=capture`,
  `EMAIL_CAPTURE_DIR=.tmp/e2e-emails` (`E2E_EMAIL_CAPTURE_DIR` in `e2e/support/constants.ts`, the directory
  global setup empties and `e2e/support/emails.ts` reads), `APP_URL=http://localhost:3100`,
  `TRUSTED_PROXY_HOPS=1` (`http-and-env.md` §5), and `reuseExistingServer: false`. Projects: `desktop`
  (Chromium, 1280×800) and `mobile` (Pixel-class device, runs the specs tagged `@mobile`). `retries: 1` on
  CI, `0` locally; `forbidOnly` on CI; `workers: 2` on CI.
- **End-to-end specs are independent of each other and of execution order** (spec files run in parallel):
  every test uses its own email addresses (`uniqueEmail()`), imports `test` from `e2e/support/fixtures.ts`
  (own network address per test — `http-and-env.md` §5), and — from PR-27, when `e2e/support/operator.ts`
  exists — any spec that changes college-level data (settings, enabled modules, divisions, college status)
  does so in a college it created itself, never in `demo`.

## 4. Coverage thresholds (Vitest, v8 provider)

| Package | Included | Threshold |
|---|---|---|
| `@masari/db` | `src/**/*.ts` except `src/schema/**` and `src/admin.ts` re-exports | lines ≥ 80%, branches ≥ 70% |
| `@masari/web` | `src/server/**`, `src/lib/**`, `src/modules/**`, `src/features/**/schemas.ts`, `src/features/**/rules.ts`; excluding `src/server/auth/auth.ts`, `src/server/auth/session.ts`, `src/server/auth/action-context.ts`, `src/server/email/transport.ts` (exercised end-to-end) | lines ≥ 80%, branches ≥ 70% |

Thresholds are switched on in the batch that adds the first real code to each package (PR-3 for
`@masari/db`, PR-9 for `@masari/web`) and are never lowered afterwards.

## 5. Accessibility and script-budget gates (inside `e2e`)

- `apps/web/e2e/support/axe.ts` exports `expectNoA11yViolations(page)`: runs axe with tags `wcag2a`,
  `wcag2aa`, `wcag21a`, `wcag21aa` and fails on any violation with impact `serious` or `critical`.
- `apps/web/e2e/a11y.spec.ts` holds two lists — public screens and signed-in screens (per role) — and scans
  each in `ar` and `en`. **Every batch that adds a screen appends it to the list.**
- `apps/web/e2e/perf-budget.spec.ts` loads a fresh context, sums `encodedDataLength` of all `Script`
  responses (Chromium DevTools protocol) until network idle, and asserts ≤ 200 KB for public screens
  (`/ar/sign-in`, `/ar/register`; `/ar` until those exist) and ≤ 300 KB for signed-in screens (`/ar/dashboard`, `/ar/admin/users` once
  it exists).

## 6. Repository files that belong to CI

| File | Content |
|---|---|
| `.github/workflows/ci.yml` | the workflow above |
| `.gitleaks.toml` | extends the default rules; allow-lists only `.env.example`, `docker-compose.yml`, `contracts/*.md` in `specs/`, and `.github/workflows/ci.yml` for the documented local-only values (by exact string, not by path wildcard) |
| `.github/dependabot.yml` | `npm` weekly (minor+patch grouped, majors separate), `github-actions` monthly |
| `.github/pull_request_template.md` | Sections: Batch (`[NNN PR-N]`), Tasks completed, What changed, How it was tested, Screenshots (ar + en) for UI, Spec deviation (or "None"), Checklist (tests added · both languages · RTL/a11y checked · no secrets · docs/env updated) |
| `docs/repo-settings.md` | Owner checklist: protect `main` (PR required, squash only, no force-push); required checks `quality`, `test`, `build`, `secrets`, `audit` after PR-2 is merged, **plus `e2e` only after PR-10 is merged** (§2); enable Dependabot alerts and secret scanning/push protection where available; what to do when `audit` fails on an upstream advisory (§2) |
