import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { LOCALES, ROLES, USER_STATUSES } from '../constants';
import { tenants } from './tenants';

/**
 * Auth-library tables (data-model.md §3.2–3.3): the Better Auth core models `user`, `session`, `account`,
 * `verification` with plural table names (Drizzle adapter `usePlural: true`) and snake_case columns. The
 * TypeScript property names are the library's field names — the adapter looks columns up by them.
 * Global tables without RLS (data-model.md §1): only the auth library and the `users` / `sessions`
 * repositories query them. Grants live in the custom migration `auth_security`.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    ...timestamps,
    // Masari columns (Better Auth `additionalFields` in apps/web/src/server/auth/auth.ts).
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    role: text('role', { enum: ROLES }).notNull().default('student'),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    locale: text('locale', { enum: LOCALES }).notNull().default('ar'),
    privacyConsentAt: timestamp('privacy_consent_at', { withTimezone: true }),
  },
  (table) => [
    index('users_tenant_role_idx').on(table.tenantId, table.role),
    index('users_tenant_created_idx').on(table.tenantId, table.createdAt.desc()),
    check('users_role_check', sql`role IN ('student','faculty','student_affairs','admin')`),
    check('users_status_check', sql`status IN ('active','suspended')`),
    check('users_locale_check', sql`locale IN ('ar','en')`),
    check('users_email_lower_check', sql`email = lower(email)`),
    check('users_name_length_check', sql`char_length(name) BETWEEN 2 AND 100`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ...timestamps,
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);
