import { MODULE_KEYS, ROLES, type ModuleKey, type Role } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY, visibleModules } from './registry';

// contracts/permissions.md §4–5 (FR-016, FR-034, FR-035): every role × all modules enabled, and every
// role × each single module disabled.

/** Expected visibility with all modules enabled (contracts/permissions.md §5), in MODULE_KEYS order. */
const ALL_ENABLED: Record<Role, ModuleKey[]> = {
  student: ['mueed', 'codejudge', 'kitabi', 'careermap', 'tadreeb'],
  faculty: ['codejudge', 'mizan'],
  student_affairs: ['mueed'],
  admin: ['kitabi', 'tadreeb'],
};

describe('MODULE_REGISTRY', () => {
  it('has exactly the six module keys, in MODULE_KEYS order', () => {
    expect(Object.keys(MODULE_REGISTRY)).toEqual([...MODULE_KEYS]);
  });

  it('gives every module at least one role and an icon', () => {
    for (const key of MODULE_KEYS) {
      expect(MODULE_REGISTRY[key].roles.length).toBeGreaterThan(0);
      expect(MODULE_REGISTRY[key].icon).toMatch(/^[A-Z][A-Za-z0-9]+$/);
    }
  });
});

describe('visibleModules', () => {
  it.each(ROLES)('shows %s the expected modules when all are enabled', (role) => {
    expect(visibleModules(role, MODULE_KEYS)).toEqual(ALL_ENABLED[role]);
  });

  it('keeps MODULE_KEYS order whatever the order of the enabled list', () => {
    expect(visibleModules('student', [...MODULE_KEYS].reverse())).toEqual(ALL_ENABLED.student);
  });

  const roleByDisabled = ROLES.flatMap((role) =>
    MODULE_KEYS.map((disabled) => [role, disabled] as const),
  );

  it.each(roleByDisabled)(
    'hides only the disabled module from %s (disabled: %s)',
    (role, disabled) => {
      const enabled = MODULE_KEYS.filter((key) => key !== disabled);
      expect(visibleModules(role, enabled)).toEqual(
        ALL_ENABLED[role].filter((key) => key !== disabled),
      );
    },
  );

  it.each(ROLES)('shows %s nothing when no module is enabled', (role) => {
    expect(visibleModules(role, [])).toEqual([]);
  });
});
