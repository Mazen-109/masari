# Contract: Routes and Screens

**Feature**: `001-platform-foundation` · Applies to `apps/web/src/app`

All screens live under `/[locale]` with `locale ∈ {ar, en}`; `ar` is the default. Paths below omit the
locale prefix (`/sign-in` means `/ar/sign-in` and `/en/sign-in`).

## 1. Global rules

| Rule | Behaviour |
|---|---|
| `/` | Redirect to `/ar` (no browser-language detection). |
| Unknown locale segment (e.g. `/fr/sign-in`) | 404, answered directly (no redirect): `proxy.ts` passes any first segment shaped like a language tag that is not `ar`/`en` through to `[locale]/layout.tsx` (`bypassesLocaleRouting` in `lib/locale.ts`). Locales are case-sensitive, so `/AR/…` is also a 404 (no normalisation to `/ar`). Consequence: no screen may use a top-level path of 2–3 letters (e.g. `/faq`) — such paths are never locale-prefixed. |
| `<html>` | `lang` = locale; `dir="rtl"` for `ar`, `dir="ltr"` for `en`. |
| Language switch | Present on every screen; navigates to the same path + query in the other locale. When signed in it also calls `setLocaleAction`. |
| Signed-out request to a signed-in screen | Redirect to `/{locale}/sign-in?next=<locale-less path+query>`. |
| `next` parameter | Honoured only if it starts with a single `/`, does not start with `//` or `/\`, contains no scheme, and is ≤ 512 chars (`lib/safe-next.ts`); otherwise ignored. |
| Signed-in request to `/sign-in`, `/register`, `/forgot-password` | Redirect to `/{locale}/dashboard`. |
| Role lacks the screen's permission, module disabled, or unknown module key | `notFound()` → localized 404 page inside the current shell (`(app)/not-found.tsx`, §5). |
| Student without academic profile on any `(app)` screen | Redirect to `/{locale}/onboarding`. |
| Suspended user or suspended college with an existing session | Treated as signed out; redirect to `/{locale}/sign-in?reason=account_suspended` or `?reason=tenant_suspended`. |
| Metadata | Every page sets a localized `<title>` of the form `<Screen> · مساري` / `<Screen> · Masari`; `robots: noindex`. |
| Guards | Every `page.tsx` under `(app)` and `(onboarding)` calls `requireSession(...)` or `requirePermission(...)` itself (layouts are not sufficient). |

## 2. Public screens — route group `(public)`

Shell: `public-header` (wordmark «مساري», language switch), centred content, link to the privacy notice.

| Path | File (`src/app/[locale]/(public)/…`) | Purpose | Query params | Batch |
|---|---|---|---|---|
| `/` (locale root) | `../page.tsx` | Signed in → `/dashboard`; signed out → `/sign-in` | — | PR-18 |
| `/sign-in` | `sign-in/page.tsx` | Email + password form; links to register and forgot password | `next`, `reason` (`account_suspended` \| `tenant_suspended`), `reset=1`, `invited=1` → info banner | PR-18 |
| `/register` | `register/page.tsx` | Student registration form | `u=<college slug>` preselects and locks the college | PR-16 |
| `/verify-email` | `verify-email/page.tsx` | "Check your email" + resend form (email input) | — | PR-16 (resend: PR-17) |
| `/email-verified` | `email-verified/page.tsx` | Result of the confirmation link: success (link to sign-in) or invalid/expired (resend form) | `error` (set by the auth library on failure) | PR-17 |
| `/forgot-password` | `forgot-password/page.tsx` | Request a reset link; always shows the same confirmation | — | PR-24 |
| `/reset-password` | `reset-password/page.tsx` | Set a new password | `token`, `error` | PR-24 |
| `/invite/[token]` | `invite/[token]/page.tsx` | Accept an invitation: shows college name + role; form (name, password, consent). Invalid/expired/used/revoked token → explanatory screen, no form | — | PR-27 |
| `/privacy` | `privacy/page.tsx` | Privacy notice (FR-011) | — | PR-15 |

## 3. Onboarding — route group `(onboarding)`

Minimal shell (header with college name, language switch, sign out; no navigation).

| Path | File | Access | Behaviour | Batch |
|---|---|---|---|---|
| `/onboarding` | `(onboarding)/onboarding/page.tsx` | `requireSession('/onboarding', { allowIncompleteProfile: true })` | Student without profile → form (student code, level, division). Anyone else → redirect `/dashboard`. | PR-22 |

## 4. Signed-in screens — route group `(app)`

Shell (`(app)/layout.tsx`): skip link → header (wordmark, college name in the current language, language
switch, user menu: name, role label, Profile, Sign out) → navigation (sidebar ≥ 1024 px; drawer opened by a
menu button below that) → `<main id="main">`.

Navigation entries, in order (built by `components/shell/nav-items.ts` from the session context):

1. Home → `/dashboard` (all roles)
2. One entry per module returned by `visibleModules(role, tenant.enabledModules)` → `/modules/<key>`
3. Section "Administration" (only with the matching permission): People → `/admin/users`, Invitations →
   `/admin/invitations`, Divisions → `/admin/divisions`, Settings → `/admin/settings`

The current entry has `aria-current="page"`.

| Path | File (`src/app/[locale]/(app)/…`) | Guard | Content | Batch |
|---|---|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | `requireSession('/dashboard')` | Greeting with name; college name; module cards (name, one-sentence description, "coming soon" badge); students: code/level/division summary; admins: shortcut cards to the four admin screens | PR-18 (basic), PR-19 (cards), PR-22 (student summary); each admin screen's batch adds its shortcut (PR-28, PR-32, PR-35, PR-36) |
| `/profile` | `profile/page.tsx` | `requireSession('/profile')` | Account form (name; email read-only); students: academic form (code read-only, level, division) | PR-23 |
| `/modules/[moduleKey]` | `modules/[moduleKey]/page.tsx` | `requireSession(...)` then `notFound()` unless key ∈ `visibleModules(...)` | Module name, description, "coming soon" | PR-19 |
| `/admin/users` | `admin/users/page.tsx` | `requirePermission('admin.users.manage', …)` | Filters (`q`, `role`, `status`), table, pagination (`page`), row actions | PR-32 (list), PR-33, PR-34 (actions) |
| `/admin/invitations` | `admin/invitations/page.tsx` | `requirePermission('admin.invitations.manage', …)` | Invite form; table with status and revoke | PR-28 (revoke: PR-29) |
| `/admin/divisions` | `admin/divisions/page.tsx` | `requirePermission('admin.settings.manage', …)` | Add form; table with edit and activate/deactivate | PR-36 |
| `/admin/settings` | `admin/settings/page.tsx` | `requirePermission('admin.settings.manage', …)` | College names, allowed domains, levels, enabled modules | PR-35 |

Query parameters of `/admin/users`: `q` (≤ 100 chars, trimmed), `role` (one of the four roles), `status`
(`active` \| `suspended`), `page` (integer ≥ 1, default 1). Invalid values are ignored (treated as absent).

## 5. Special files

| File | Behaviour |
|---|---|
| `src/app/[locale]/layout.tsx` | Root layout: `<html lang dir>`, fonts, `NextIntlClientProvider`, base metadata. Validates the locale (`notFound()` otherwise). |
| `src/app/[locale]/[...rest]/page.tsx` | Catch-all for unknown paths under a valid locale: calls `notFound()` so `[locale]/not-found.tsx` renders inside the locale layout; its `generateMetadata` sets the localized 404 title (`meta.notFound`). Added in PR-7. |
| `src/app/[locale]/not-found.tsx` | Localized 404 with a link to home, for public paths and unknown paths (rendered in the root layout, without the signed-in shell). |
| `src/app/[locale]/(app)/not-found.tsx` | The same localized 404 content rendered inside the `(app)` layout, so that `notFound()` thrown by an `(app)` page (missing permission, disabled or unknown module) keeps the header and navigation. Added in PR-19. |
| `src/app/[locale]/error.tsx` | Localized generic error with "try again"; never shows error details. |
| `src/app/not-found.tsx` (+ whatever root file the pinned next-intl requires) | Fallback 404 for paths without a valid locale. |
| `src/app/global-error.tsx` | Last-resort error page when the locale layout itself fails: static bilingual text (no message catalog available), "try again", no error details. |
| `src/app/robots.ts` | `Disallow: /` for all user agents. |
| `src/proxy.ts` | next-intl locale routing only; matcher excludes `/api`, `/_next`, and static files. No authorisation logic. |

## 6. Message namespaces (`apps/web/messages/{ar,en}.json`)

`common` (app name, actions, statuses, roles, language names, levels 1–7 as ordinals), `errors` (one key per
`ErrorCode` and `FieldErrorCode` in `server-actions.md`), `nav`, `auth` (sign-in, register, verify,
forgot/reset, invite), `privacy`, `onboarding`, `profile`, `dashboard`, `modules` (name + description per
module key), `admin.users`, `admin.invitations`, `admin.divisions`, `admin.settings`, `meta` (page titles).

Fixed Arabic terms: الكلية (college), طالب, عضو هيئة تدريس, شئون الطلاب, إدارة الكلية, الفرقة (level), الشعبة
(division), كود الطالب (student code), معيد / CodeJudge / ميزان / كتابي / CareerMap / تدريب (module names),
قريبًا (coming soon), تسجيل الدخول (sign in), إنشاء حساب (register), تسجيل الخروج (sign out).
Levels display as «الفرقة الأولى … السابعة» / "Level 1 … 7".

## 7. Accessibility contract (every screen)

- One `<h1>`; landmarks `header`, `nav` (labelled), `main`; skip link is the first focusable element.
- Every input has a visible `<label>`; errors are rendered in an element referenced by `aria-describedby`,
  the input gets `aria-invalid="true"`, and a form-level error summary has `role="alert"`.
- Tables have a `<caption>` (visually hidden allowed) and `<th scope>`; on widths < 640 px tables may scroll
  horizontally inside a focusable, labelled region.
- Dialogs/menus/drawers trap focus, close on Escape, and return focus to their trigger.
- `autocomplete` attributes: `name`, `email`, `current-password`, `new-password`.
- Inputs for email, password, student code, division code, slug, and domains carry `dir="ltr"`.
