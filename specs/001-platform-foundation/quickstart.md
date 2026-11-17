# Quickstart & Validation Guide: Platform Foundation

**Feature**: `001-platform-foundation` · Commands: [contracts/cli.md](./contracts/cli.md) · Environment:
[contracts/http-and-env.md](./contracts/http-and-env.md) §3

This guide gets the system running locally with the demo college and lists the scenarios that prove the
feature works. Steps become available as PR batches merge (noted in brackets). No paid or external service
is needed (FR-047).

## 1. Prerequisites

- Node.js 24 (22 works) and pnpm 10 (`corepack enable` picks the pinned version)
- PostgreSQL 16+, either:
  - **Option A — Docker**: Docker Desktop / Docker Engine with Compose, or
  - **Option B — existing PostgreSQL** (e.g. cloud agent sessions without Docker)

## 2. Setup

```bash
pnpm install                      # [PR-1]
cp .env.example .env              # [PR-3] local-only values; edit nothing for Option A
```

**Option A — Docker** [PR-3]

```bash
pnpm db:up                        # starts postgres:16 on localhost:5432 (owner role masari_owner)
```

**Option B — existing PostgreSQL 16+** [PR-3] — create the owner role and database once (run as a
PostgreSQL superuser; on Debian/Ubuntu images: `service postgresql start`, then `su postgres -c psql`):

```sql
CREATE ROLE masari_owner LOGIN SUPERUSER PASSWORD 'masari_dev_owner';
CREATE DATABASE masari OWNER masari_owner;
```

(`SUPERUSER` is for local test databases only; a hosted database needs just `CREATEROLE` on the owner.)

**Both options**

```bash
pnpm db:migrate                   # [PR-3] applies migrations, creates/updates the runtime role masari_web
pnpm db:seed                      # [PR-6] demo college "demo" + divisions; [PR-26] prints an admin invitation link
pnpm dev                          # http://localhost:3000  → redirects to /ar
```

Emails are not sent in development: each message is written to `apps/web/.tmp/emails/*.json` and its first
link is printed in the terminal running `pnpm dev`.

## 3. Checks

```bash
pnpm check                        # format, lint, types, i18n parity, RTL utilities, unit + integration tests
pnpm build                        # production build (needs no environment variables)
pnpm test:e2e                     # builds, then Playwright + axe + script budget on port 3100
```

`pnpm test` recreates database `masari_test`; `pnpm test:e2e` recreates `masari_e2e`. Neither touches the
development database `masari`. First e2e run: `pnpm --filter @masari/web exec playwright install chromium`.

## 4. Validation scenarios

Each scenario maps to a user story in [spec.md](./spec.md) and is automated in the named e2e spec. Run them
by hand against `pnpm dev` when reviewing a batch.

### V1 — Student joins and reaches the Arabic home (US1) · `register.spec.ts`, `email-confirmation.spec.ts`, `auth.spec.ts`, `shell.spec.ts` [PR-15…PR-20]

1. Open `http://localhost:3000` → address becomes `/ar/sign-in`; page is right-to-left.
2. "إنشاء حساب" → college preselected (only `demo` exists) → fill name, `s1@example.test`, a 10+ character
   password, tick consent → "check your email" screen.
3. Open the link printed in the terminal → success screen → sign in → `/ar/dashboard` greets by name and
   lists Mu'eed, CodeJudge, Kitabi, CareerMap, Tadreeb as "قريبًا". (Before PR-22 there is no profile step.)
4. Switch language → `/en/dashboard`, left-to-right; sign out; sign in again → lands on `/en/dashboard`.
5. Register `s1@example.test` again → same "check your email" screen; the capture folder gains an "already
   have an account" email; no second user exists.
6. Sign in with a wrong password → generic error. Open `/ar/dashboard` signed out → sign-in → back to the
   dashboard after signing in.

### V2 — Academic profile (US2) · `profile.spec.ts` [PR-21…PR-23]

1. A new student signs in → `/ar/onboarding`; `/ar/dashboard` redirects back to it.
2. Enter code `20260001`, level 2, division «علوم الحاسب» → dashboard shows all three.
3. A second student entering `20260001` gets "code already in use".
4. `/ar/profile`: change level to 3 → dashboard shows level 3; the code field is read-only.

### V3 — Password recovery (US3) · `password-reset.spec.ts` [PR-24]

1. "نسيت كلمة المرور" with any email → same confirmation text. For a real account, a reset email is captured.
2. Open the link → set a new password → sign in with it; the old password fails; a previously open session
   in another browser context is signed out. Re-opening the same link shows "invalid or expired".

### V4 — Operator onboards a college (US4) · `college-onboarding.spec.ts` [PR-25…PR-27]

```bash
pnpm tenant:create --slug sci-demo --name-ar "كلية العلوم (تجريبي)" --name-en "Faculty of Science (Demo)" --admin-email dean@example.test
```

1. Open the printed link → college name and role "إدارة الكلية" shown → set name + password + consent →
   sign in → dashboard shows the admin area for "كلية العلوم".
2. As that admin, no user, division, or invitation of `demo` is visible anywhere; as a `demo` student, the
   onboarding division list shows only `demo` divisions.
3. `pnpm tenant:set-status --slug sci-demo --status suspended` → the admin's next click lands on sign-in with
   "college access suspended"; signing in is refused with the same message; `demo` users are unaffected.
   Set it back to `active`.
4. Re-open the used invitation link → "invitation no longer valid".

### V5 — Staff invitations and role-based access (US5) · `invitations.spec.ts`, `rbac.spec.ts` [PR-28…PR-30]

1. As the `demo` admin (accept the link printed by `pnpm db:seed`): `/ar/admin/invitations` → invite
   `prof@example.test` as faculty and `sa@example.test` as Student Affairs → both appear as pending; emails
   captured.
2. Accept both → faculty sees CodeJudge + Mizan only; Student Affairs sees Mu'eed only; neither sees an
   "Administration" section; `/ar/admin/users` shows the 404 page for both and for a student.
3. Invite an email that already has an account → "this email cannot be invited". Revoke a pending
   invitation → its link shows "no longer valid".

### V6 — People management (US6) · `admin-users.spec.ts` [PR-31…PR-34]

1. `/ar/admin/users`: search `2026` → the student from V2; filter by role; page size 20.
2. Change the faculty member's role to Student Affairs → their next page load shows the new navigation.
3. Suspend the student → their open session lands on sign-in; sign-in says "account suspended"; reactivate.
4. The admin's own row offers no role change or suspend action; correcting a student's code to an existing
   one is refused.

### V7 — College settings (US7) · `admin-settings.spec.ts`, `admin-divisions.spec.ts` [PR-35, PR-36]

1. `/ar/admin/settings`: set allowed domains to `example.edu` → registering `x@gmail.com` for `demo` is
   refused naming the domain; clear it again.
2. Disable Kitabi → gone from every role's navigation; `/ar/modules/kitabi` is a 404; re-enable.
3. Try levels = 2 while a student is at level 3 → refused.
4. `/ar/admin/divisions`: add `SE` «هندسة البرمجيات» / "Software Engineering" → selectable in a student's
   profile; deactivate it → no longer offered, but a student who has it keeps it.

### V8 — Cross-cutting [PR-9, PR-12, PR-37, PR-38]

- `curl -i http://localhost:3000/api/health` → `200 {"status":"ok"}`; stop PostgreSQL → `503`.
- `curl -i -X POST http://localhost:3000/api/auth/sign-up/email` → `404`.
- Response headers on any page include the CSP and the others in contracts/http-and-env.md §2.
- Keyboard only: Tab from the address bar reaches "skip to content" first; every form and menu in V1–V7 is
  operable; focus is always visible.
- At 320 px width and at 200% zoom, no screen needs horizontal scrolling except data tables inside their
  scroll region.
- Start the web app with `DATABASE_URL` pointing at the owner role → the server refuses to start and names
  the reason.

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Server exits: "The runtime database role can bypass row-level security" (log event `startup.failed`) | `DATABASE_URL` uses the owner role. Use the `masari_web` URL from `.env.example` and run `pnpm db:migrate`. |
| Server exits naming environment variables | Missing/invalid values in `.env`; compare with `.env.example`. |
| `pnpm test` fails to connect | PostgreSQL is not running (`pnpm db:up` or start the system service) or `DATABASE_MIGRATION_URL` is wrong. |
| No email arrives | Development uses capture mode: look in `apps/web/.tmp/emails/` or the dev-server terminal. |
| Playwright cannot download browsers (restricted network) | Run the other checks locally and rely on the CI `e2e` job; say so in the PR. |
