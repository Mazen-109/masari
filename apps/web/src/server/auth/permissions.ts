import { MODULE_KEYS, type ModuleKey, type Role } from '@masari/db';
import { MODULE_REGISTRY } from '@/modules/registry';

/**
 * Role permissions (contracts/permissions.md §2; FR-014). The `module.*` permissions and their grants are
 * derived from the module registry; the other rows are listed in GRANTS. Signing in, the home screen, and
 * the own account are not permissions — any valid session grants them (requireSession).
 */

type ModulePermission = `module.${ModuleKey}`;

export const PERMISSIONS = [
  'profile.academic.manage_own',
  ...MODULE_KEYS.map((key): ModulePermission => `module.${key}`),
  'admin.users.manage',
  'admin.invitations.manage',
  'admin.settings.manage', // college settings, divisions, enabled modules
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Grants of every permission that is not a module permission (✓ cells of the matrix). */
const GRANTS: Record<Exclude<Permission, ModulePermission>, readonly Role[]> = {
  'profile.academic.manage_own': ['student'],
  'admin.users.manage': ['admin'],
  'admin.invitations.manage': ['admin'],
  'admin.settings.manage': ['admin'],
};

const MATRIX: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ...MODULE_KEYS.map(
    (key) => [`module.${key}`, new Set<string>(MODULE_REGISTRY[key].roles)] as const,
  ),
  ...Object.entries(GRANTS).map(
    ([permission, roles]) => [permission, new Set<string>(roles)] as const,
  ),
]);

/** true when the role holds the permission; false for any role or permission not in the matrix. */
export function can(role: Role, permission: Permission): boolean {
  return MATRIX.get(permission)?.has(role) ?? false;
}
