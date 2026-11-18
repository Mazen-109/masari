# Masari — deployment

This file is completed by task T144 (feature 001, PR-38: pilot on Vercel + Neon + an SMTP provider). Until
then it records the rules that already bind any deployment.

## Database connections

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

## Build-time environment: `APP_URL` and HSTS

The security headers (`contracts/http-and-env.md` §2) are computed when `next build` loads
`apps/web/next.config.ts` and are written into the build output; they are not re-read at start-up.
`Strict-Transport-Security` is included only when `APP_URL` starts with `https://` **at build time**. The
production build MUST therefore run with the production `APP_URL` set (on Vercel: define it for the build,
not only for the runtime). A build made without it — like the CI `build` job, which has no application
variables on purpose — never sends HSTS, whatever `APP_URL` the server later starts with.

## Client network address

Every proxy counted in `TRUSTED_PROXY_HOPS` MUST append (or overwrite with) the address it received the
connection from, and the application port MUST NOT be reachable except through those proxies. Vercel: `1`.
One nginx/Caddy in front of the container: `1` (`contracts/http-and-env.md` §5).

## Access logs

The People screen keeps its search in the address (`/{locale}/admin/users?q=…`), and the search term can be
a person's name, email, or student code. Access logs of the hosting provider, CDN, and any reverse proxy
MUST redact the query string of `/ar/admin/users` and `/en/admin/users` (log the path only), and MUST also
redact it from the `Referer` header when that header is logged: the page sends a `same-origin` referrer
policy, so the full address leaves the browser only towards Masari itself. Personal data never belongs in
logs (constitution; `contracts/http-and-env.md` §4).
