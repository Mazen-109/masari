import { describe, expect, it } from 'vitest';
import { canActOnUser } from './rules';

const ADMIN = 'admn'.repeat(4);
const OTHER = 'othr'.repeat(4);

describe('canActOnUser', () => {
  it('allows acting on another account', () => {
    expect(canActOnUser(ADMIN, OTHER)).toBe(true);
  });

  it('refuses acting on the own account', () => {
    expect(canActOnUser(ADMIN, ADMIN)).toBe(false);
  });

  it.each([
    ['', OTHER],
    [ADMIN, ''],
    ['', ''],
  ])('refuses a missing id (%j, %j)', (actor, target) => {
    expect(canActOnUser(actor, target)).toBe(false);
  });
});
