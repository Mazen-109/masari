import { ROLES, type Role } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS, type Permission } from './permissions';

// contracts/permissions.md §2 (FR-014). EXPECTED is a hand-written copy of the matrix, deliberately not
// derived from the code under test. Adding a permission without a row here fails both the key check and
// the 40-assertion count.

const EXPECTED: Record<string, readonly Role[]> = {
  'profile.academic.manage_own': ['student'],
  'module.mueed': ['student', 'student_affairs'],
  'module.codejudge': ['student', 'faculty'],
  'module.mizan': ['faculty'],
  'module.kitabi': ['student', 'admin'],
  'module.careermap': ['student'],
  'module.tadreeb': ['student', 'admin'],
  'admin.users.manage': ['admin'],
  'admin.invitations.manage': ['admin'],
  'admin.settings.manage': ['admin'],
};

describe('PERMISSIONS', () => {
  it('lists exactly the ten permissions of the matrix, in contract order', () => {
    expect([...PERMISSIONS]).toEqual(Object.keys(EXPECTED));
  });

  it.each(Object.entries(EXPECTED))(
    '%s is granted to at least one role and denied to at least one',
    (_permission, granted) => {
      expect(granted.length).toBeGreaterThan(0);
      expect(granted.length).toBeLessThan(ROLES.length);
    },
  );
});

describe('can', () => {
  it('matches all 40 cells of the matrix (10 permissions × 4 roles)', () => {
    expect.assertions(40);
    for (const permission of PERMISSIONS) {
      for (const role of ROLES) {
        const expected = EXPECTED[permission]?.includes(role) ?? 'missing matrix row';
        expect({ permission, role, granted: can(role, permission) }).toEqual({
          permission,
          role,
          granted: expected,
        });
      }
    }
  });

  it.each([
    'admin.everything',
    'module.unknown',
    'module.',
    '',
    'toString',
    '__proto__',
    'constructor',
    'ADMIN.USERS.MANAGE',
  ])('returns false for the unknown permission %j, for every role', (permission) => {
    for (const role of ROLES) {
      expect(can(role, permission as Permission)).toBe(false);
    }
  });

  it('returns false for an unknown role', () => {
    for (const permission of PERMISSIONS) {
      expect(can('operator' as Role, permission)).toBe(false);
    }
  });
});
