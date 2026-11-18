import type { ModuleKey, Role } from '@masari/db';
import { MODULE_REGISTRY, visibleModules } from '@/modules/registry';
import { can, type Permission } from '@/server/auth/permissions';

/**
 * Entries of the signed-in navigation (contracts/routes.md §4; FR-016), built from the session context:
 * Home, then one entry per visible module, then the "Administration" section filtered by permission.
 * Server-only: client components receive the built entries, never this module (it reaches the
 * registry and permissions, which import `@masari/db`).
 */

export type AdminNavKey = 'users' | 'invitations' | 'divisions' | 'settings';

/** A full message key (root namespace) naming the entry. */
export type NavLabelKey = 'nav.home' | `modules.${ModuleKey}.name` | `nav.admin.${AdminNavKey}`;

export type NavItem = {
  /** Stable id, also used as `data-nav` in the markup. */
  id: string;
  /** Locale-less path. */
  href: string;
  /** lucide icon name (see nav-icon.tsx). */
  icon: string;
  label: NavLabelKey;
};

export type NavItems = { main: NavItem[]; admin: NavItem[] };

export type AdminNavEntry = {
  key: AdminNavKey;
  href: string;
  icon: string;
  permission: Permission;
};

/**
 * The administration screens, in display order (People, Invitations, Divisions, Settings). Each admin
 * screen's batch adds its entry in its place (Divisions — PR-36).
 * Also the source of the dashboard's administration shortcuts.
 */
export const ADMIN_NAV_ENTRIES: readonly AdminNavEntry[] = [
  { key: 'users', href: '/admin/users', icon: 'Users', permission: 'admin.users.manage' },
  {
    key: 'invitations',
    href: '/admin/invitations',
    icon: 'MailPlus',
    permission: 'admin.invitations.manage',
  },
  {
    key: 'settings',
    href: '/admin/settings',
    icon: 'Settings',
    permission: 'admin.settings.manage',
  },
];

export type NavContext = {
  user: { role: Role };
  tenant: { enabledModules: readonly ModuleKey[] };
};

export function buildNavItems(
  ctx: NavContext,
  adminEntries: readonly AdminNavEntry[] = ADMIN_NAV_ENTRIES,
): NavItems {
  const home: NavItem = { id: 'home', href: '/dashboard', icon: 'House', label: 'nav.home' };
  const modules = visibleModules(ctx.user.role, ctx.tenant.enabledModules).map((key): NavItem => ({
    id: `module-${key}`,
    href: `/modules/${key}`,
    icon: MODULE_REGISTRY[key].icon,
    label: `modules.${key}.name`,
  }));
  const admin = adminEntries
    .filter((entry) => can(ctx.user.role, entry.permission))
    .map((entry): NavItem => ({
      id: `admin-${entry.key}`,
      href: entry.href,
      icon: entry.icon,
      label: `nav.admin.${entry.key}`,
    }));
  return { main: [home, ...modules], admin };
}
