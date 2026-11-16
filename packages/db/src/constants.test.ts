import { describe, expect, it } from 'vitest';
import { LOCALES, MODULE_KEYS, ROLES } from './index';

describe('constants', () => {
  it('lists the six module keys in order', () => {
    expect(MODULE_KEYS).toEqual(['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb']);
  });

  it('lists the four roles in order', () => {
    expect(ROLES).toEqual(['student', 'faculty', 'student_affairs', 'admin']);
  });

  it('lists Arabic first among the locales', () => {
    expect(LOCALES).toEqual(['ar', 'en']);
  });
});
