# Contract: Roles, Permissions, Session Context, Module Registry

**Feature**: `001-platform-foundation` · Implements spec FR-012…FR-016, FR-034, FR-035

## 1. Roles

`ROLES = ['student', 'faculty', 'student_affairs', 'admin']` (from `@masari/db`). Exactly one per user.

| Role key | Arabic label | English label |
|---|---|---|
| `student` | طالب | Student |
| `faculty` | عضو هيئة تدريس | Faculty member |
| `student_affairs` | شئون الطلاب | Student Affairs |
| `admin` | إدارة الكلية | Administration |

## 2. Permissions — `apps/web/src/server/auth/permissions.ts`

```ts
export const PERMISSIONS = [
  'app.access',
  'profile.academic.manage_own',
  'module.mueed', 'module.codejudge', 'module.mizan', 'module.kitabi', 'module.careermap', 'module.tadreeb',
  'admin.users.manage',
  'admin.invitations.manage',
  'admin.settings.manage',          // college settings, divisions, enabled modules
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export function can(role: Role, permission: Permission): boolean;   // false for anything not in the matrix
```

Matrix (✓ = granted; everything else denied):

| Permission | student | faculty | student_affairs | admin |
|---|---|---|---|---|
| `app.access` | ✓ | ✓ | ✓ | ✓ |
| `profile.academic.manage_own` | ✓ | | | |
| `module.mueed` | ✓ | | ✓ | |
| `module.codejudge` | ✓ | ✓ | | |
| `module.mizan` | | ✓ | | |
| `module.kitabi` | ✓ | | | ✓ |
| `module.careermap` | ✓ | | | |
| `module.tadreeb` | ✓ | | | ✓ |
| `admin.users.manage` | | | | ✓ |
| `admin.invitations.manage` | | | | ✓ |
| `admin.settings.manage` | | | | ✓ |

The `module.*` rows MUST be derived from the module registry (§4), not duplicated by hand.
Unit test: a table-driven test asserts all 44 cells.

Additional rules that are not role-based (`features/admin-users/rules.ts`, unit-tested):

- `canActOnUser(actorId, targetId)` → false when equal (no self role change, no self suspension).

## 3. Session context and guards — `apps/web/src/server/auth/session.ts`

```ts
export type SessionContext = {
  user: { id: string; name: string; email: string; role: Role; locale: Locale };
  tenant: {
    id: string; slug: string; nameAr: string; nameEn: string;
    levelsCount: number; enabledModules: ModuleKey[]; allowedEmailDomains: string[];
  };
  studentProfile: { studentCode: string; level: number; divisionId: string } | null;  // added in PR-22; null for non-students
};

/** Cached per request (React cache). Returns null when there is no session, the user is suspended,
 *  or the college is suspended. Reads user and college fresh from the database on every request. */
export function getSessionContext(): Promise<SessionContext | null>;

/** Why getSessionContext() returned null, for the sign-in banner. */
export function getSessionDenialReason(): Promise<'none' | 'account_suspended' | 'tenant_suspended'>;

/** For pages. Redirects to /{locale}/sign-in?next=<returnTo> (plus &reason=… when suspended) if there is
 *  no usable session. Redirects students without an academic profile to /{locale}/onboarding unless
 *  allowIncompleteProfile is true. `returnTo` is the locale-less path of the calling page. */
export function requireSession(returnTo: string, opts?: { allowIncompleteProfile?: boolean }): Promise<SessionContext>;

/** requireSession + notFound() when can(role, permission) is false. */
export function requirePermission(permission: Permission, returnTo: string): Promise<SessionContext>;
```

`getActionContext(permission?)` for Server Actions is specified in `server-actions.md` §1.

Rules:

- The session cookie is read only through the auth library (`auth.api.getSession`); no cookie cache — role
  changes and suspensions apply on the next request (FR-030, FR-031, FR-019).
- Guards are the only place that decide access. Components may hide controls using the same `can()` /
  `visibleModules()` functions but MUST NOT implement their own role comparisons (`role === 'admin'` outside
  `permissions.ts`, `registry.ts`, and `rules.ts` files fails review).
- `apps/web/src/app/guard-coverage.test.ts` scans every `page.tsx` under `[locale]/(app)` and
  `[locale]/(onboarding)` and fails if the file contains neither `requireSession(` nor
  `requirePermission(`.

## 4. Module registry — `apps/web/src/modules/registry.ts`

```ts
export const MODULE_REGISTRY: Record<ModuleKey, { roles: readonly Role[]; icon: string }> = {
  mueed:     { roles: ['student', 'student_affairs'], icon: 'MessagesSquare' },
  codejudge: { roles: ['student', 'faculty'],         icon: 'Code2' },
  mizan:     { roles: ['faculty'],                    icon: 'Scale' },
  kitabi:    { roles: ['student', 'admin'],           icon: 'BookOpen' },
  careermap: { roles: ['student'],                    icon: 'Compass' },
  tadreeb:   { roles: ['student', 'admin'],           icon: 'Briefcase' },
};
/** Modules the role may use AND the college has enabled, in MODULE_KEYS order. */
export function visibleModules(role: Role, enabledModules: readonly ModuleKey[]): ModuleKey[];
```

Icons are lucide icon names (the implementer may pick equivalents if a name does not exist in the pinned
version). Display names and one-sentence descriptions come from the `modules` message namespace:

| Key | Arabic name | English name | English description (Arabic written natively to match) |
|---|---|---|---|
| `mueed` | معيد | Mu'eed | Ask about the college regulations and see your timetable. |
| `codejudge` | CodeJudge | CodeJudge | Submit programming assignments and get instant feedback. |
| `mizan` | ميزان | Mizan | Check that an exam is balanced and covers the course. |
| `kitabi` | كتابي | Kitabi | Get your textbooks and access codes online. |
| `careermap` | CareerMap | CareerMap | See which skills you need for the job you want. |
| `tadreeb` | تدريب | Tadreeb | Find and track internships that fit you. |

## 5. Expected visibility (used by the RBAC end-to-end matrix)

With all modules enabled:

| Role | Module entries | Admin entries |
|---|---|---|
| student | mueed, codejudge, kitabi, careermap, tadreeb | none |
| faculty | codejudge, mizan | none |
| student_affairs | mueed | none |
| admin | kitabi, tadreeb | People, Invitations, Divisions, Settings |

For each role, every path in `routes.md` §4 that is not listed for that role MUST return the 404 page, and
every admin Server Action MUST return `forbidden`.
