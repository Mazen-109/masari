import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { MODULE_KEYS, TENANT_STATUSES } from '../constants';

/**
 * A college (data-model.md §3.1). Global table: RLS is enabled (not forced) and its policies and grants
 * live in the custom migration `tenants_security`.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    status: text('status', { enum: TENANT_STATUSES }).notNull().default('active'),
    allowedEmailDomains: text('allowed_email_domains')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    levelsCount: smallint('levels_count').notNull().default(4),
    enabledModules: text('enabled_modules', { enum: MODULE_KEYS })
      .array()
      .notNull()
      .default(sql`ARRAY['mueed','codejudge','mizan','kitabi','careermap','tadreeb']::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check(
      'tenants_slug_check',
      sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40`,
    ),
    check('tenants_name_ar_check', sql`char_length(name_ar) BETWEEN 1 AND 120`),
    check('tenants_name_en_check', sql`char_length(name_en) BETWEEN 1 AND 120`),
    check('tenants_status_check', sql`status IN ('active','suspended')`),
    check('tenants_allowed_email_domains_check', sql`cardinality(allowed_email_domains) <= 20`),
    check('tenants_levels_count_check', sql`levels_count BETWEEN 1 AND 7`),
    check(
      'tenants_enabled_modules_check',
      sql`enabled_modules <@ ARRAY['mueed','codejudge','mizan','kitabi','careermap','tadreeb']::text[]`,
    ),
  ],
);
