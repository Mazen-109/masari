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

/** A college (data-model.md §3.1). */
export interface Tenant {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  status: TenantStatus;
  allowedEmailDomains: string[];
  levelsCount: number;
  enabledModules: ModuleKey[];
  createdAt: Date;
  updatedAt: Date;
}

/** What the public college picker needs — nothing else. */
export type TenantPublic = Pick<Tenant, 'id' | 'slug' | 'nameAr' | 'nameEn'>;

/** A specialisation track of a college (data-model.md §3.5). `code` is immutable after creation. */
export interface Division {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An account as the application sees it (contracts/db-api.md §1.6). Never carries the password hash
 * (`accounts.password`) or session tokens.
 */
export interface UserSummary {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  status: UserStatus;
  locale: Locale;
  createdAt: Date;
}

/**
 * One audit-log entry (data-model.md §3.8). `actorUserId` null = system/operator. Metadata holds IDs and
 * enumerations only — never emails, names, tokens, or passwords.
 */
export interface AuditEventInput {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}
