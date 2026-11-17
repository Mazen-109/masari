import { MODULE_KEYS, ROLES, type ModuleKey, type Role } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ENTRIES, buildNavItems, type AdminNavEntry } from './nav-items';

// contracts/routes.md §4 and permissions.md §5 (FR-016): Home first, then the visible modules in
// MODULE_KEYS order, then the administration entries the role holds the permission for.

function ctx(role: Role, enabledModules: readonly ModuleKey[] = MODULE_KEYS) {
  return { user: { role }, tenant: { enabledModules } };
}

const EXPECTED_MODULES: Record<Role, ModuleKey[]> = {
  student: ['mueed', 'codejudge', 'kitabi', 'careermap', 'tadreeb'],
  faculty: ['codejudge', 'mizan'],
  student_affairs: ['mueed'],
  admin: ['kitabi', 'tadreeb'],
};

describe('buildNavItems', () => {
  it.each(ROLES)('gives %s Home and exactly its modules, in order', (role) => {
    const { main } = buildNavItems(ctx(role));
    expect(main[0]).toEqual({ id: 'home', href: '/dashboard', icon: 'House', label: 'nav.home' });
    expect(main.slice(1).map((item) => item.href)).toEqual(
      EXPECTED_MODULES[role].map((key) => `/modules/${key}`),
    );
  });

  it('names modules from the modules namespace and uses the registry icons', () => {
    const { main } = buildNavItems(ctx('faculty'));
    expect(main.slice(1)).toEqual([
      {
        id: 'module-codejudge',
        href: '/modules/codejudge',
        icon: 'CodeXml',
        label: 'modules.codejudge.name',
      },
      { id: 'module-mizan', href: '/modules/mizan', icon: 'Scale', label: 'modules.mizan.name' },
    ]);
  });

  it('leaves out modules the college has disabled', () => {
    const { main } = buildNavItems(ctx('student', ['kitabi', 'mizan']));
    expect(main.map((item) => item.id)).toEqual(['home', 'module-kitabi']);
  });

  it('shows only Home when no module is visible', () => {
    expect(buildNavItems(ctx('student_affairs', ['codejudge'])).main).toHaveLength(1);
  });

  it('has no administration entries yet for any role (later batches add them)', () => {
    expect(ADMIN_NAV_ENTRIES).toEqual([]);
    for (const role of ROLES) expect(buildNavItems(ctx(role)).admin).toEqual([]);
  });

  it('filters administration entries by permission, keeping their order', () => {
    const entries: AdminNavEntry[] = [
      { key: 'users', href: '/admin/users', icon: 'Users', permission: 'admin.users.manage' },
      {
        key: 'settings',
        href: '/admin/settings',
        icon: 'Settings',
        permission: 'admin.settings.manage',
      },
    ];
    expect(buildNavItems(ctx('admin'), entries).admin).toEqual([
      { id: 'admin-users', href: '/admin/users', icon: 'Users', label: 'nav.admin.users' },
      {
        id: 'admin-settings',
        href: '/admin/settings',
        icon: 'Settings',
        label: 'nav.admin.settings',
      },
    ]);
    for (const role of ['student', 'faculty', 'student_affairs'] as const) {
      expect(buildNavItems(ctx(role), entries).admin).toEqual([]);
    }
  });
});
