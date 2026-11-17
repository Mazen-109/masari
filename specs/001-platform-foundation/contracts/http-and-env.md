# Contract: HTTP Endpoints, Response Headers, Environment

**Feature**: `001-platform-foundation`

## 1. HTTP endpoints (route handlers)

There is no public REST API. Only these route handlers exist:

### 1.1 `GET /api/health` — `apps/web/src/app/api/health/route.ts` (FR-045)

| Case | Status | Body | Headers |
|---|---|---|---|
| App up and `ping()` succeeds | 200 | `{"status":"ok"}` | `Cache-Control: no-store` |
| Database unreachable | 503 | `{"status":"unavailable"}` | `Cache-Control: no-store` |

No authentication, no other fields, no error details. Dynamic (never cached or prerendered).

### 1.2 `/api/auth/[...all]` — `apps/web/src/app/api/auth/[...all]/route.ts`

The auth library's handler behind an allow-list implemented in
`apps/web/src/server/auth/allowed-paths.ts`:

```ts
/** method is upper-case; pathname is the full request pathname. */
export function isAllowedAuthRequest(method: string, pathname: string): boolean;
```

| Allowed | Purpose |
|---|---|
| `GET /api/auth/verify-email` | Target of the confirmation link; verifies and redirects to the `callbackURL` (`/{locale}/email-verified`, with `?error=…` on failure) |
| `GET /api/auth/reset-password/<token>` | Target of the reset link; redirects to `/{locale}/reset-password?token=…` (or `?error=…`) |
| `GET /api/auth/error` | The library's error redirect target |

Everything else — any other path, any non-GET method, including `POST /api/auth/sign-up/email`,
`POST /api/auth/sign-in/email`, `GET /api/auth/get-session` — returns **404** with an empty body, without
calling the library. Unit test: table of allowed and refused (method, path) pairs, including path-traversal
and trailing-slash variants.

If the pinned auth-library version uses different link paths, adjust the allow-list to exactly the paths
its emails link to and record it as a Spec deviation.

## 2. Response headers (all routes) — `apps/web/next.config.ts` (FR-048, FR-049)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` (development only: add `'unsafe-eval'` to `script-src` and `ws:` to `connect-src`) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Robots-Tag` | `noindex, nofollow` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` — only when `APP_URL` starts with `https://` |

`poweredByHeader: false`. Session cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_URL` is
https. Server Actions accept only same-origin requests (framework default; do not widen
`serverActions.allowedOrigins`).

## 3. Environment variables

One `.env` file at the repository root for local work (git-ignored); `.env.example` is committed and MUST
list every variable below with a safe placeholder or local-only development value.

| Variable | Used by | Required | Rule / default |
|---|---|---|---|
| `APP_ENV` | web, db scripts | yes (web; `pnpm db:seed`) | `development` \| `test` \| `production`. Also read (optional) by `getAdminDbEnv()`; `pnpm db:seed` refuses to run unless it is `development` or `test` (`cli.md` §3) |
| `APP_URL` | web, db scripts | yes | Absolute origin without trailing slash, e.g. `http://localhost:3000`; MUST be `https://…` when `APP_ENV=production` |
| `DATABASE_URL` | web, db | yes | PostgreSQL URL of the **runtime** login role (e.g. `masari_web`) |
| `DATABASE_MIGRATION_URL` | db scripts, tests, e2e setup | scripts/tests only | PostgreSQL URL of the **owner** role; MUST NOT be read by `apps/web/src/**` |
| `BETTER_AUTH_SECRET` | web | yes | ≥ 32 characters |
| `TRUSTED_PROXY_HOPS` | web | no | Integer 0–5, default `0`: how many reverse proxies in front of the app add the client address to `X-Forwarded-For` (§5). MUST be ≥ 1 when `APP_ENV=production` |
| `EMAIL_TRANSPORT` | web | yes | `capture` \| `smtp`; `capture` is rejected when `APP_ENV=production` |
| `EMAIL_FROM` | web | yes | e.g. `Masari <no-reply@example.edu>` |
| `EMAIL_CAPTURE_DIR` | web, e2e | no | default `.tmp/emails`, resolved against the web app's working directory (`apps/web`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | web | when `EMAIL_TRANSPORT=smtp` | `SMTP_PORT` integer (default 587); `SMTP_SECURE` `true` \| `false` (default `false` = STARTTLS) |

Local development values in `.env.example` (not secrets — they only work against the local container):

```dotenv
APP_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgres://masari_web:masari_dev_web@localhost:5432/masari
DATABASE_MIGRATION_URL=postgres://masari_owner:masari_dev_owner@localhost:5432/masari
BETTER_AUTH_SECRET=local-development-only-secret-change-me-please
TRUSTED_PROXY_HOPS=0
EMAIL_TRANSPORT=capture
EMAIL_FROM="Masari <no-reply@localhost>"
```

Parsing

- `apps/web/src/server/env.ts` exports `getEnv()` (Zod-validated, memoised, **lazy**: nothing is validated at
  import time, so `next build` runs without any variable). `apps/web/src/instrumentation.ts` calls
  `getEnv()` and `assertSafeRuntimeRole()` at server start; a failure stops the server with a message that
  names the invalid variables (names only, never values).
- `packages/db/src/env.ts` exports `getDbEnv()` (`DATABASE_URL`) and `getAdminDbEnv()`
  (`DATABASE_MIGRATION_URL`, `DATABASE_URL`, optional `APP_URL`, optional `APP_ENV`), also lazy.
- **Nothing that needs the environment exists at module scope.** Importing any module of `apps/web/src` or
  `@masari/db` MUST NOT read a variable, open a connection, or construct the auth instance. The database
  pool, `getAuthDb()` (`db-api.md` §2), and the auth instance (`getAuth()` in `server/auth/auth.ts`) are
  lazy, memoised getters created on first call. This is what lets `next build` run with an empty
  environment while it imports every route module.
- **Start-up check guard**: `instrumentation.ts` `register()` runs the checks only in the Node.js server
  runtime and never during a build: it returns immediately unless `process.env.NEXT_RUNTIME === 'nodejs'`
  and `process.env.NEXT_PHASE !== 'phase-production-build'`. The implementer verifies on the pinned Next.js
  version whether `register()` is invoked in build workers; the guard stays either way, and PR-9's "build
  with an empty environment" acceptance check proves it.
- No other file reads `process.env` (ESLint `no-restricted-properties`/`n/no-process-env` equivalent), except
  `next.config.ts`, `playwright.config.ts`, `vitest.config.ts`, and `instrumentation.ts` (only the two
  framework variables named above).

## 4. Logging contract — `apps/web/src/server/log.ts`

```ts
export const log: {
  info(event: string, fields?: Record<string, string | number | boolean | null>): void;
  warn(event: string, fields?: …): void;
  error(event: string, fields?: …): void;
};
```

One JSON object per line: `{ "level", "time" (ISO), "event", ...fields }`. Field values are IDs, counts,
codes, and durations only. Forbidden in logs: emails, names, student codes, passwords, tokens, cookies,
request bodies, full URLs with query strings. `console.*` is forbidden outside `log.ts` and
`packages/db/scripts/**` (ESLint `no-console`).

The only exception is the development convenience of `emails.md` §1: with `APP_ENV=development` and the
capture transport, the first link of a captured email is written to the terminal (it contains a token).
It never happens in `test` or `production`.

## 5. Client network address — `apps/web/src/server/request.ts`

```ts
/** The client's IP address, or null when it cannot be established from a trusted source. */
export function getClientIp(): Promise<string | null>;                 // reads the request headers + getEnv()
/** Pure rule behind it (unit-tested). */
export function clientIpFromHeader(forwardedFor: string | null, hops: number): string | null;
```

`X-Forwarded-For` is written by whoever sends the request, so it is trusted only as far as the deployment's
own proxies vouch for it:

1. `hops = getEnv().TRUSTED_PROXY_HOPS`. When `hops = 0`, the header is ignored and the result is `null`.
2. Otherwise split the `x-forwarded-for` request header on commas and trim each entry. Take the entry that
   is `hops` positions from the **right** end (`entries[entries.length - hops]`): entries to its left were
   supplied by the client and are never used.
3. If the header is missing, has fewer than `hops` entries, or the chosen entry is not a valid IPv4/IPv6
   address (`node:net` `isIP`), the result is `null`.

Uses of the result: the per-IP rate-limit key (`server-actions.md` §2 — `null` falls into one shared bucket,
which is strict, never permissive) and `audit_events.ip` (`NULL` when unknown). The raw header is never
logged or stored.

Deployment rule (also in `docs/deployment.md`): every proxy counted in `TRUSTED_PROXY_HOPS` MUST append
(or overwrite with) the address it received the connection from, and the application port MUST NOT be
reachable except through those proxies. Vercel: `1`. One nginx/Caddy in front of the container: `1`.
Unit test of `clientIpFromHeader` (`request.test.ts`, table-driven): `hops` 0/1/2 × missing header, one entry, a client-forged
left-hand entry (ignored), too few entries, a non-IP entry, IPv6, surrounding spaces.

**End-to-end tests and rate limits.** The e2e server runs with `TRUSTED_PROXY_HOPS=1` and no proxy, so the
address is whatever the test browser sends — the production code path, with no test-only branch in the
application. `apps/web/e2e/support/fixtures.ts` exports the `test` object every spec imports; it sets
`extraHTTPHeaders: { 'x-forwarded-for': <address> }` for every browser context and API request context of
a test, where the address is derived deterministically from the project name, the test id, and the retry
number, inside `198.18.0.0/15` (reserved for benchmarking, never a real client). Each test therefore has its
own per-IP buckets, a retried test starts with fresh ones, and tests that assert a per-email limit are not
disturbed by other tests. No single test may need more requests than a per-IP limit allows (the largest is
the people-list test with about 25 registrations against a limit of 60). Rate limits are never raised,
disabled, or bypassed for tests.
