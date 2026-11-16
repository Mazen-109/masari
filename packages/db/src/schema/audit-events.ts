import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Append-only audit log (data-model.md §3.8). Tenant-scoped: forced RLS, the `tenant_isolation` policy, and
 * the SELECT/INSERT-only grants live in the custom migration `divisions_audit_security`.
 * `actor_user_id` has no foreign key yet: `users` arrives in PR-12, whose migration adds it.
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
  ],
);
