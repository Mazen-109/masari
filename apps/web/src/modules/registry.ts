import { MODULE_KEYS, type ModuleKey, type Role } from '@masari/db';

/**
 * The six modules (contracts/permissions.md §4; FR-016, FR-034, FR-035). `roles` is the single source of
 * the `module.*` permissions in permissions.ts. Icons are lucide icon names. Display names and descriptions
 * live in the `modules` message namespace.
 */
export const MODULE_REGISTRY: Record<ModuleKey, { roles: readonly Role[]; icon: string }> = {
  mueed: { roles: ['student', 'student_affairs'], icon: 'MessagesSquare' },
  codejudge: { roles: ['student', 'faculty'], icon: 'CodeXml' },
  mizan: { roles: ['faculty'], icon: 'Scale' },
  kitabi: { roles: ['student', 'admin'], icon: 'BookOpen' },
  careermap: { roles: ['student'], icon: 'Compass' },
  tadreeb: { roles: ['student', 'admin'], icon: 'Briefcase' },
};

/** Modules the role may use AND the college has enabled, in MODULE_KEYS order. */
export function visibleModules(role: Role, enabledModules: readonly ModuleKey[]): ModuleKey[] {
  return MODULE_KEYS.filter(
    (key) => enabledModules.includes(key) && MODULE_REGISTRY[key].roles.includes(role),
  );
}
