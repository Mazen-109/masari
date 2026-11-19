# Contract: Permissions and Navigation (additions)

**Feature**: `002-academic-catalog` · Implements spec FR-030, FR-031 · Extends
`specs/001-platform-foundation/contracts/permissions.md` (guards, session context, and rules unchanged)

## 1. New permissions — `apps/web/src/server/auth/permissions.ts`

```ts
export const PERMISSIONS = [
  'profile.academic.manage_own',
  'courses.view_own',               // NEW: "My courses" and its course details
  ...MODULE_KEYS.map(k => `module.${k}`),
  'catalog.manage',                 // NEW: terms, courses, topics, placements, teachers
  'roster.manage',                  // NEW: official student list, imports, verification review
  'admin.users.manage', 'admin.invitations.manage', 'admin.settings.manage',
] as const;
```

| Permission | student | faculty | student_affairs | admin |
|---|---|---|---|---|
| `courses.view_own` | ✓ | | | |
| `catalog.manage` | | | ✓ | ✓ |
| `roster.manage` | | | ✓ | ✓ |

The matrix becomes 13 permissions × 4 roles = **52 cells**; the table-driven unit test asserts all of them
(001 PR-13 rule: it fails if a permission is added without matrix entries). Each new permission has at least
one granted and one denied role (constitution II). The three are **not** module permissions: they do not
depend on `tenants.enabled_modules` (spec Clarifications).

## 2. Navigation — `apps/web/src/components/shell/nav-items.ts`

Order (additions in bold):

1. Home → `/dashboard`
2. **My courses → `/courses`** (with `courses.view_own`)
3. Module entries (unchanged)
4. **Section "Academic affairs" «الشئون الأكاديمية»** (only with `catalog.manage` or `roster.manage`):
   **Terms → `/catalog/terms`**, **Courses → `/catalog/courses`** (`catalog.manage`), **Official student
   list → `/roster`** (`roster.manage`)
5. Section "Administration" (unchanged)

`aria-current="page"` also marks the entry for nested paths (`/catalog/courses/…` → Courses,
`/roster/imports/…` → Official student list, `/courses/…` → My courses).

Home screen: students get a "My courses" card with the number of courses this term (or the empty-state
reason); catalog managers get shortcut cards to the three academic-affairs screens (the existing
`admin-shortcuts.tsx` pattern, shown per permission).

## 3. Expected visibility (RBAC end-to-end matrix additions)

| Role | Added entries |
|---|---|
| student | My courses |
| faculty | none |
| student_affairs | Terms, Courses, Official student list |
| admin | Terms, Courses, Official student list (in addition to the Administration section) |

For each role, every path in routes.md §2 that is not listed for it returns the 404 page, and every action
of server-actions.md §4–§5 returns `forbidden` (forged with `submitAs`, 001 server-actions.md §6).
