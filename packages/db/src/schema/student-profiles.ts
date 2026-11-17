import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { divisions } from './divisions';
import { tenants } from './tenants';

/**
 * The academic profile of a student (data-model.md §3.6) — the first part of the shared student profile.
 * Tenant-scoped: forced RLS, the `tenant_isolation` policy, and the grants live in the custom migration
 * `student_profiles_security`. The composite foreign key to `divisions (tenant_id, id)` means a profile can
 * never point at another college's division.
 */
export const studentProfiles = pgTable(
  'student_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .default(sql`app_tenant_id()`)
      .references(() => tenants.id, { onDelete: 'restrict' }),
    studentCode: text('student_code').notNull(),
    level: smallint('level').notNull(),
    divisionId: uuid('division_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('student_profiles_tenant_code_unique').on(table.tenantId, table.studentCode),
    foreignKey({
      name: 'student_profiles_division_fk',
      columns: [table.tenantId, table.divisionId],
      foreignColumns: [divisions.tenantId, divisions.id],
    }).onDelete('restrict'),
    check('student_profiles_student_code_check', sql`student_code ~ '^[A-Za-z0-9-]{3,20}$'`),
    check('student_profiles_level_check', sql`level BETWEEN 1 AND 7`),
  ],
);
