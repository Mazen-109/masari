import { describe, expect, it } from 'vitest';
import { isCurrentPath } from './is-current-path';

describe('isCurrentPath', () => {
  it.each([
    ['/dashboard', '/dashboard', true],
    ['/dashboard/', '/dashboard', true],
    ['/modules/mueed', '/modules/mueed', true],
    ['/admin/users/42', '/admin/users', true],
    ['/modules/mueedx', '/modules/mueed', false],
    ['/modules', '/modules/mueed', false],
    ['/dashboard', '/modules/mueed', false],
    ['/', '/dashboard', false],
  ])('%s is current for %s: %s', (pathname, href, expected) => {
    expect(isCurrentPath(pathname, href)).toBe(expected);
  });
});
