import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Fixed-window rate-limit counters (data-model.md §3.4). Global infrastructure table: no tenant_id and no
 * RLS; keys hold a purpose prefix and a hash, never raw personal data. Grants live in the custom migration
 * `rate_limit_security`.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  () => [
    check('rate_limit_counters_key_check', sql`char_length(key) <= 200`),
    check('rate_limit_counters_count_check', sql`count >= 0`),
  ],
);
