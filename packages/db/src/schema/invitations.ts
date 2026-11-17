import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { INVITATION_STATUSES, ROLES } from '../constants';
import { users } from './auth';
import { tenants } from './tenants';

/**
 * Invitations to join a college with a role (data-model.md §3.7). Tenant-scoped: forced RLS, the
 * `tenant_isolation` and `invitation_token_lookup` policies, and the grants live in the custom migration
 * `invitations_security`. Only the SHA-256 hex of the token is stored; the token itself never is.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .default(sql`app_tenant_id()`)
      .references(() => tenants.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    tokenHash: text('token_hash').notNull().unique('invitations_token_hash_unique'),
    status: text('status', { enum: INVITATION_STATUSES }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedUserId: text('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invitations_one_pending_per_email')
      .on(table.tenantId, table.email)
      .where(sql`status = 'pending'`),
    index('invitations_tenant_created_idx').on(table.tenantId, table.createdAt.desc()),
    check('invitations_email_lower_check', sql`email = lower(email)`),
    check('invitations_role_check', sql`role IN ('student','faculty','student_affairs','admin')`),
    check('invitations_status_check', sql`status IN ('pending','accepted','revoked')`),
  ],
);
