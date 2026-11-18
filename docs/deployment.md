# Masari — deployment

How to run the pilot of feature 001 on hosted services: **Vercel** (the web app) + **Neon** (PostgreSQL) +
an **SMTP provider** (email) — `specs/001-platform-foundation/research.md` §21. Nothing in the code depends
on these providers: any Node.js 22+ host, PostgreSQL 16+, and SMTP server work with the same rules. A
production Docker image comes with feature 009.

Every account, password, and key below is created and kept by the owner. None of them is ever committed,
pasted into an issue or pull request, or written to a log (constitution III, CLAUDE.md "Never commit
secrets").

## 1. What the owner creates and keeps secret

| Item | Where | Secret? |
|---|---|---|
| Vercel project, rooted at `apps/web` | Vercel | the account login |
| Neon project (PostgreSQL 16+), with its default owner role | Neon | the owner role's password (inside `DATABASE_MIGRATION_URL`) |
| A runtime role password you choose (e.g. 32+ random characters) | inside `DATABASE_URL` | yes |
| `BETTER_AUTH_SECRET`: at least 32 random characters, e.g. `openssl rand -base64 48` | Vercel environment | yes — rotating it signs everybody out |
| An SMTP account and a sending address on a domain you control (SPF and DKIM set up for it) | SMTP provider | the SMTP password |
| The production domain (`https://…`) | Vercel / DNS | no |

The owner URL (`DATABASE_MIGRATION_URL`) stays on the owner's machine (or in a password manager); it is never
stored in Vercel.

## 2. Database connections

Masari uses two PostgreSQL URLs (`specs/001-platform-foundation/contracts/http-and-env.md` §3):

- `DATABASE_URL` — the **runtime** login role (`masari_web` locally): `NOSUPERUSER NOBYPASSRLS`, member of
  `masari_app`. This is the only database URL the web process receives.
- `DATABASE_MIGRATION_URL` — the **owner** role that owns the schema and runs migrations. It is used only by
  operator scripts (`pnpm db:migrate`, `pnpm tenant:create`, `pnpm tenant:set-status`) and by tests, run from
  an operator's machine or a one-off job.

**Production MUST NEVER give the web process the owner/migration URL**: neither as `DATABASE_URL` nor as
`DATABASE_MIGRATION_URL` in the web app's environment. The owner role owns every table and can alter or drop
them and their row-level-security policies (and is often a superuser, which bypasses row-level security
altogether), so a web process holding it would lose tenant isolation (constitution III). The start-up check refuses to run when
`DATABASE_URL` is a superuser or `BYPASSRLS` role, but an owner URL merely present in the environment is
not detected — keep it out of the hosting provider's runtime variables entirely.

On Neon:

- `DATABASE_MIGRATION_URL` = the owner role's **direct** connection string (host without `-pooler`), with
  `sslmode=require`. The owner needs `CREATEROLE` (Neon's default owner role has it), not superuser.
- `DATABASE_URL` = the **pooled** connection string (host with `-pooler`), with the runtime role's name and
  the password you chose, and `sslmode=require` — e.g.
  `postgres://masari_web:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<database>?sslmode=require`.
  You do not create this role in the Neon console: `pnpm db:migrate` creates it (or updates its password)
  from this URL. Transaction pooling is safe: the tenant context is set per transaction
  (`set_config(…, true)`).
- Pick the region closest to the college (e.g. Frankfurt for Egypt) and the same region for Vercel's
  functions.

## 3. Build-time environment: `APP_URL`, `NODE_ENV`, and HSTS

The security headers (`contracts/http-and-env.md` §2) are computed when `next build` loads
`apps/web/next.config.ts` and are written into the build output; they are not re-read at start-up.

- **`APP_URL` MUST be set at build time.** `Strict-Transport-Security` is included only when `APP_URL`
  starts with `https://` **when `next build` runs**. The production build MUST therefore run with the
  production `APP_URL` set (on Vercel: make the variable available to the build, not only to the runtime —
  Vercel's default). A build made without it — like the CI `build` job, which has no application variables
  on purpose — never sends HSTS, whatever `APP_URL` the server later starts with.
- **A production build MUST NEVER run with `NODE_ENV=development`.** `next.config.ts` reads `NODE_ENV` to
  choose the Content-Security-Policy, so such a build would ship the development CSP (`'unsafe-eval'` in
  `script-src`, `ws:` in `connect-src`) to every visitor. Never define `NODE_ENV` in the hosting provider's
  variables or the build command; `next build` sets `production` itself.

Check both after every deployment (§7): the response headers must contain `Strict-Transport-Security` and a
`script-src` without `'unsafe-eval'`.

## 4. Vercel project

- **Root Directory**: `apps/web`; framework preset Next.js; keep "Include files outside the root directory"
  on (the app compiles `packages/db` from source). Install and build commands: the defaults (`pnpm install`,
  `next build`). To build with exactly the pnpm version pinned in the root `package.json`
  (`packageManager`), add the build-only variable `ENABLE_EXPERIMENTAL_COREPACK=1`.
- **Node.js version**: 24.x (`.nvmrc`).
- **Environment variables** — Production scope only (Preview deployments must not receive production
  secrets; disable them or give them a separate Neon branch and their own values):

| Variable | Production value |
|---|---|
| `APP_ENV` | `production` |
| `APP_URL` | `https://<your domain>` — no trailing slash; also needed at build time (§3) |
| `DATABASE_URL` | the pooled runtime URL of §2 |
| `BETTER_AUTH_SECRET` | the secret of §1 |
| `TRUSTED_PROXY_HOPS` | `1` (§5) |
| `EMAIL_TRANSPORT` | `smtp` (`capture` is refused in production) |
| `EMAIL_FROM` | e.g. `Masari <no-reply@your-college.edu>` — the address your SMTP account may send from |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | from the SMTP provider: port `587` with `SMTP_SECURE=false` (STARTTLS), or `465` with `true` |

Never set `DATABASE_MIGRATION_URL` or `NODE_ENV` here. With an invalid or missing variable the server refuses
to start and its log names the variables (never their values).

## 5. Client network address

Every proxy counted in `TRUSTED_PROXY_HOPS` MUST append (or overwrite with) the address it received the
connection from, and the application port MUST NOT be reachable except through those proxies. Vercel: `1`.
One nginx/Caddy in front of the container: `1` (`contracts/http-and-env.md` §5). A value that is too high
lets a client choose its own address and escape the per-address rate limits; `0` puts every visitor into one
shared rate-limit bucket.

## 6. Migrations and the first college

Run these from the owner's machine, in a checkout of the commit being deployed (`pnpm install` done), before
the first deployment and before every deployment whose commit adds a migration: the new code expects its
schema, and migrations are forward-only (a deployment is rolled back by deploying a fix, never by undoing a
migration).

The scripts load the repository's `.env` but never override a variable that is already set, so set **all
four** variables below in the shell; any you leave unset would be taken from your local `.env`. Read secrets
without echoing them, so they stay out of the shell history:

```bash
read -rs DATABASE_MIGRATION_URL && export DATABASE_MIGRATION_URL   # owner, direct URL
read -rs DATABASE_URL && export DATABASE_URL                       # runtime role, pooled URL
export APP_ENV=production APP_URL=https://<your domain>

pnpm db:migrate        # applies migrations; creates/updates the runtime role named in DATABASE_URL
pnpm tenant:create --slug <slug> --name-ar "<Arabic name>" --name-en "<English name>" --admin-email <email>
```

`pnpm tenant:create` prints `College created: <slug>` and a one-time invitation link
(`<APP_URL>/ar/invite/<token>`, valid 7 days). Send that link to the college's first administrator over a
private channel; it is shown only once and never stored in plain form. Suspend or reactivate a college with
`pnpm tenant:set-status --slug <slug> --status suspended|active`.

Never run `pnpm db:seed` against a hosted database: the demo college is for local work only (the script
refuses unless `APP_ENV` is `development` or `test`). Close the shell (or `unset` the variables) when done.

## 7. Smoke test after a deployment

```bash
curl -i https://<your domain>/api/health                     # 200 {"status":"ok"}
curl -i -X POST https://<your domain>/api/auth/sign-up/email # 404 (library endpoints stay closed)
```

1. The health response carries every header of `contracts/http-and-env.md` §2, **including**
   `Strict-Transport-Security`, and its CSP `script-src` is `'self' 'unsafe-inline'` (no `'unsafe-eval'`).
2. `https://<your domain>/` redirects to `/ar/sign-in`, right-to-left, with no error in the browser console.
3. The administrator opens the invitation link, sets a name and password, signs in, and sees the dashboard
   with the administration shortcuts; an invitation sent from `/ar/admin/invitations` arrives by email.
4. The Vercel function log shows no `startup.failed` event. If it does, its reason names the problem: a
   runtime role that can bypass row-level security (wrong `DATABASE_URL`) or invalid variables.

## 8. Access logs

The People screen keeps its search in the address (`/{locale}/admin/users?q=…`), and the search term can be
a person's name, email, or student code. Access logs of the hosting provider, CDN, and any reverse proxy
MUST redact the query string of `/ar/admin/users` and `/en/admin/users` (log the path only), and MUST also
redact it from the `Referer` header when that header is logged: the page sends a `same-origin` referrer
policy, so the full address leaves the browser only towards Masari itself. Personal data never belongs in
logs (constitution; `contracts/http-and-env.md` §4).
