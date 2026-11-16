export const ROLES = ['student', 'faculty', 'student_affairs', 'admin'] as const;
export const USER_STATUSES = ['active', 'suspended'] as const;
export const TENANT_STATUSES = ['active', 'suspended'] as const;
export const LOCALES = ['ar', 'en'] as const;
export const MODULE_KEYS = [
  'mueed',
  'codejudge',
  'mizan',
  'kitabi',
  'careermap',
  'tadreeb',
] as const;
export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const;

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type Locale = (typeof LOCALES)[number];
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
