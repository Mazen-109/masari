# Requirement traceability: Platform Foundation

**Feature**: `001-platform-foundation` · Requirements: [spec.md](./spec.md) "Functional Requirements" ·
Batches: [tasks.md](./tasks.md)

Every functional requirement, the batch or batches that implemented it (from the `(FR-nnn)` references
of [tasks.md](./tasks.md); PR-1 … PR-37 are merged, PR-38 is the final sweep), and the automated tests that
prove it. `e2e/…` is `apps/web/e2e/…`; `web/…` is `apps/web/src/…`; `db/…` is `packages/db/…`.

| FR | Requirement (short) | Implemented in | Evidence (tests) | ✓ |
|---|---|---|---|---|
| FR-001 | Student self-registration (college, name, email, password, consent) | PR-16 | `e2e/register.spec.ts`; `web/features/auth/schemas.test.ts` | ✅ |
| FR-002 | Only active colleges listed; preselected by link or when only one | PR-4, PR-16 | `e2e/register.spec.ts`; `db/test/tenants.int.test.ts` | ✅ |
| FR-003 | Allowed email domains restrict self-registration | PR-16 (enforced), PR-35 (configured) | `web/features/auth/rules.test.ts`; `e2e/admin-settings.spec.ts` | ✅ |
| FR-004 | Email confirmation link (24 h), resend, no auto sign-in | PR-12, PR-17 | `e2e/email-confirmation.spec.ts` | ✅ |
| FR-005 | No account enumeration; "you already have an account" email | PR-16, PR-17, PR-24 | `e2e/register.spec.ts`, `e2e/email-confirmation.spec.ts`, `e2e/password-reset.spec.ts` | ✅ |
| FR-006 | Email + password sign-in; generic failure message | PR-18 | `e2e/auth.spec.ts`; `web/features/auth/actions.test.ts` | ✅ |
| FR-007 | Passwords 10–128, no composition rules, stored hashed | PR-12, PR-16, PR-24 | `web/features/auth/schemas.test.ts`; `e2e/password-reset.spec.ts`; `db/test/auth-schema.int.test.ts` | ✅ |
| FR-008 | 7-day sessions, HttpOnly cookie, sign-out, safe return path | PR-12, PR-14, PR-18 | `e2e/auth.spec.ts`; `web/lib/safe-next.test.ts` | ✅ |
| FR-009 | Rate limits per email and per network address | PR-6, PR-14, PR-16, PR-17, PR-18, PR-24, PR-27 | `web/server/rate-limit.test.ts`; `db/test/rate-limit.int.test.ts`; `e2e/auth.spec.ts`, `e2e/password-reset.spec.ts`, `e2e/college-onboarding.spec.ts` | ✅ |
| FR-010 | Password recovery link (1 h, single use) ends all sessions | PR-12, PR-24 | `e2e/password-reset.spec.ts`; `web/features/auth/actions.reset.test.ts` | ✅ |
| FR-011 | Bilingual privacy notice; consent time recorded | PR-15, PR-16, PR-27 | `e2e/privacy.spec.ts`, `e2e/register.spec.ts`, `e2e/college-onboarding.spec.ts` | ✅ |
| FR-012 | One college and one of four roles per user | PR-12 | `db/test/auth-schema.int.test.ts`, `db/test/users.int.test.ts` | ✅ |
| FR-013 | Self-registration creates students only; other roles by invitation or role change | PR-12, PR-16 | `e2e/register.spec.ts`, `e2e/auth-endpoints.spec.ts` | ✅ |
| FR-014 | Permission table enforced on every screen and action, on the server | PR-13, PR-14, PR-30 | `web/server/auth/permissions.test.ts`; `e2e/rbac.spec.ts` | ✅ |
| FR-015 | Forbidden screen = not found; refused action returns no data | PR-14, PR-30 | `e2e/rbac.spec.ts` | ✅ |
| FR-016 | Navigation and home show exactly the permitted, enabled entries | PR-13, PR-19, PR-30 | `web/components/shell/nav-items.test.ts`, `web/modules/registry.test.ts`; `e2e/shell.spec.ts`, `e2e/rbac.spec.ts` | ✅ |
| FR-017 | College data isolated where it is stored (row-level security) | PR-3, PR-4 (and every tenant-scoped table since) | `db/test/context.int.test.ts`, `db/test/rls-meta.int.test.ts`, cross-tenant cases in each `db/test/*.int.test.ts`; `e2e/college-onboarding.spec.ts` | ✅ |
| FR-018 | Operator creates a college with an admin invitation; suspends/reactivates | PR-6, PR-26 | `db/test/cli.int.test.ts`, `db/test/admin.int.test.ts`; `e2e/college-onboarding.spec.ts` | ✅ |
| FR-019 | Suspended college: no sign-in, sessions refused, reason shown | PR-14, PR-18, PR-26 | `e2e/college-onboarding.spec.ts` | ✅ |
| FR-020 | Invitations to any role: single use, 7 days, one pending, limits | PR-25, PR-27, PR-28 | `db/test/invitations.int.test.ts`; `e2e/invitations.spec.ts`, `e2e/college-onboarding.spec.ts` | ✅ |
| FR-021 | Accepting creates a confirmed account with the invited role | PR-27 | `e2e/college-onboarding.spec.ts`; `web/features/auth/actions.accept.test.ts` | ✅ |
| FR-022 | Invitation list with status; revoke disables the link | PR-25, PR-28, PR-29 | `e2e/invitations.spec.ts`; `db/test/invitations.int.test.ts` | ✅ |
| FR-023 | Registration with a pending invitation sends "use your invitation" | PR-29 | `e2e/invitations.spec.ts` | ✅ |
| FR-024 | Academic profile required before other signed-in screens | PR-21, PR-22 | `e2e/profile.spec.ts`; `db/test/student-profiles.int.test.ts` | ✅ |
| FR-025 | Student code 3–20, unique per college, not changeable by the student | PR-22 | `e2e/profile.spec.ts`; `web/features/profile/schemas.test.ts` | ✅ |
| FR-026 | Level within the college's levels; active division | PR-21, PR-22 | `web/features/profile/rules.test.ts`; `e2e/profile.spec.ts` | ✅ |
| FR-027 | Profile screen: name, language; students also level and division | PR-23 | `e2e/profile.spec.ts`; `web/features/profile/actions.test.ts` | ✅ |
| FR-028 | Administrator corrects a student's code, level, division | PR-34 | `e2e/admin-users.spec.ts`; `web/features/admin-users/actions.test.ts` | ✅ |
| FR-029 | People list: 20 per page, search, role and status filters | PR-31, PR-32 | `db/test/users.int.test.ts`; `e2e/admin-users.spec.ts` | ✅ |
| FR-030 | Role change applies on the next request; never one's own | PR-33 | `e2e/admin-users.spec.ts`; `web/features/admin-users/rules.test.ts` | ✅ |
| FR-031 | Suspend/reactivate ends sessions immediately; never oneself | PR-31, PR-33 | `e2e/admin-users.spec.ts`; `db/test/sessions.int.test.ts` | ✅ |
| FR-032 | College names, allowed domains, number of levels | PR-4, PR-35 | `e2e/admin-settings.spec.ts`; `web/features/tenant-settings/*.test.ts` | ✅ |
| FR-033 | Divisions: add, edit, deactivate/reactivate, never delete | PR-5, PR-36 | `e2e/admin-divisions.spec.ts`; `web/features/divisions/*.test.ts`; `db/test/divisions.int.test.ts` | ✅ |
| FR-034 | Enable/disable each module; disabled = gone and not found | PR-13, PR-35 | `e2e/admin-settings.spec.ts`; `web/modules/registry.test.ts` | ✅ |
| FR-035 | Six module entries and cards leading to "coming soon" screens | PR-13, PR-19 | `e2e/shell.spec.ts`; `web/modules/registry.test.ts` | ✅ |
| FR-036 | Arabic (default, RTL) and English (LTR); language switch everywhere | PR-7, PR-10 | `e2e/locale.spec.ts`; `pnpm i18n:check` (`scripts/check-i18n.test.mjs`) | ✅ |
| FR-037 | Language remembered with the account across devices | PR-20 | `e2e/auth.spec.ts`; `web/features/profile/actions.test.ts` | ✅ |
| FR-038 | Every email Arabic first, then English, each in its direction | PR-11 | `e2e/emails.spec.ts`; `web/server/email/templates/*.test.ts` | ✅ |
| FR-039 | One signed-in shell, 320 px to desktop | PR-18, PR-19 | `e2e/shell.spec.ts`, `e2e/responsive.spec.ts` | ✅ |
| FR-040 | Home greets by name; student summary; admin shortcuts | PR-18, PR-19, PR-22, PR-28 (PR-32, PR-35, PR-36 added shortcuts) | `e2e/shell.spec.ts`, `e2e/invitations.spec.ts` | ✅ |
| FR-041 | Western digits; Gregorian dates in Cairo time | PR-7 | `web/lib/format.test.ts`; `scripts/check-i18n.test.mjs` | ✅ |
| FR-042 | WCAG 2.1 AA in both languages; keyboard; 200% zoom | PR-10, PR-15, PR-38 (all screens, 320 px and zoom checks) | `e2e/a11y.spec.ts`, `e2e/responsive.spec.ts`, `e2e/shell.spec.ts` | ✅ |
| FR-043 | Performance budgets; script ≤ 200 KB public / 300 KB signed in | PR-10, PR-38 (`/ar/register` budget, recorded timings) | `e2e/perf-budget.spec.ts` | ✅ |
| FR-044 | Per-college append-only audit record of security events | PR-5, PR-12, PR-18, PR-22, PR-23, PR-24, PR-27, PR-28, PR-29, PR-33, PR-34, PR-35, PR-36 | `db/test/audit.int.test.ts`; `web/server/audit.test.ts`; audit assertions in the feature e2e specs | ✅ |
| FR-045 | Status check without exposing data | PR-9 | `e2e/health.spec.ts`; `web/app/api/health/route.test.ts` | ✅ |
| FR-046 | Every change checked automatically; not mergeable on failure | PR-2 (PR-10 added `e2e`) | `.github/workflows/ci.yml`; `docs/repo-settings.md` | ✅ |
| FR-047 | Local start with a demo college from a written quickstart | PR-3, PR-6, PR-38 (quickstart run) | `quickstart.md`; `db/test/admin.int.test.ts` (seed) | ✅ |
| FR-048 | Browser protections on every response | PR-37 | `web/lib/security-headers.test.ts`; `e2e/security-headers.spec.ts` | ✅ |
| FR-049 | Search engines asked not to index | PR-7, PR-37 | `web/lib/security-headers.test.ts`; `e2e/security-headers.spec.ts` | ✅ |

All 49 functional requirements are implemented and covered by tests; none is left open for a later batch.
