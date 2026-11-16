import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Specialisation tracks of a college (data-model.md §3.5). Tenant-scoped: forced RLS, the `tenant_isolation`
 * policy, and the grants live in the custom migration `divisions_audit_security`.
 */
export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .default(sql`app_tenant_id()`)
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('divisions_tenant_code_unique').on(table.tenantId, table.code),
    unique('divisions_tenant_id_unique').on(table.tenantId, table.id),
    check('divisions_code_check', sql`code ~ '^[A-Z0-9_-]{1,16}$'`),
    check('divisions_name_ar_check', sql`char_length(name_ar) BETWEEN 1 AND 80`),
    check('divisions_name_en_check', sql`char_length(name_en) BETWEEN 1 AND 80`),
    check('divisions_sort_order_check', sql`sort_order BETWEEN 0 AND 9999`),
  ],
);
