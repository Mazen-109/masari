/**
 * Every table in schema `public` (data-model.md §1). test/rls-meta.int.test.ts compares this list with the
 * live database: a table missing here, or whose RLS, policies, or runtime-role privileges differ, fails CI.
 * Every new table is added here in the same pull request as its migration.
 */

export type TablePrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface TableClassification {
  /** `tenant`: college-owned rows with `tenant_id`; `global`: registry, auth library, infrastructure. */
  readonly scope: 'global' | 'tenant';
  /** `forced` is mandatory for tenant-scoped tables. */
  readonly rls: 'none' | 'enabled' | 'forced';
  /** Names of every row-level-security policy on the table. */
  readonly policies: readonly string[];
  /** Table-level privileges of the runtime group role `masari_app`. */
  readonly privileges: readonly TablePrivilege[];
  /** Column-level privileges of `masari_app` beyond the table-level ones. */
  readonly columnPrivileges?: Readonly<Partial<Record<TablePrivilege, readonly string[]>>>;
}

export const TABLE_CLASSIFICATION: Readonly<Record<string, TableClassification>> = {
  tenants: {
    scope: 'global',
    rls: 'enabled',
    policies: ['tenants_select', 'tenants_update'],
    privileges: ['SELECT'],
    columnPrivileges: {
      UPDATE: [
        'name_ar',
        'name_en',
        'allowed_email_domains',
        'levels_count',
        'enabled_modules',
        'updated_at',
      ],
    },
  },
  // Auth-library identity tables: read before a college is known, so no RLS (constitution III exemption;
  // compensating controls in data-model.md §1).
  users: {
    scope: 'global',
    rls: 'none',
    policies: [],
    privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  sessions: {
    scope: 'global',
    rls: 'none',
    policies: [],
    privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  accounts: {
    scope: 'global',
    rls: 'none',
    policies: [],
    privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  verifications: {
    scope: 'global',
    rls: 'none',
    policies: [],
    privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  rate_limit_counters: {
    scope: 'global',
    rls: 'none',
    policies: [],
    privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  divisions: {
    scope: 'tenant',
    rls: 'forced',
    policies: ['tenant_isolation'],
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  student_profiles: {
    scope: 'tenant',
    rls: 'forced',
    policies: ['tenant_isolation'],
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  audit_events: {
    scope: 'tenant',
    rls: 'forced',
    policies: ['tenant_isolation'],
    privileges: ['SELECT', 'INSERT'],
  },
};
