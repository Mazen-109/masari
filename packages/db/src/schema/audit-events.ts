import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { tenants } from './tenants';

/**
 * Append-only audit log (data-model.md §3.8). Tenant-scoped: forced RLS, the `tenant_isolation` policy, and
 * the SELECT/INSERT-only grants live in the custom migration `divisions_audit_security`.
 * `actor_user_id` is NULL for system/operator events; deleting a user keeps their events and clears the
 * actor (`audit_events_actor_user_id_fk … ON DELETE SET NULL`, added by the PR-12 migration).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .default(sql`app_tenant_id()`)
      .references(() => tenants.id, { onDelete: 'restrict' }),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_tenant_created_idx').on(table.tenantId, table.createdAt.desc()),
    check('audit_events_action_check', sql`char_length(action) <= 64`),
    foreignKey({
      name: 'audit_events_actor_user_id_fk',
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete('set null'),
  ],
);
