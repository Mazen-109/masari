import { getPool } from './client';

/**
 * Start-up checks of the runtime connection (contracts/db-api.md §1.3, constitution III): the application
 * MUST refuse to start when its role could bypass row-level security.
 */

/** SELECT 1 on the runtime pool; throws on failure. */
export async function ping(): Promise<void> {
  await getPool().query('SELECT 1');
}

interface RoleSafetyRow {
  superuser: boolean;
  bypassrls: boolean;
  replication: boolean;
  owns_tables: boolean;
}

type Query = (text: string) => Promise<{ rows: RoleSafetyRow[] }>;

/** The runtime role could bypass row-level security. The message names role attributes, never a URL. */
export class UnsafeRuntimeRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRuntimeRoleError';
  }
}

// A table owner is not subject to non-forced RLS (the `tenants` registry), so owning a public table — or
// being a member of a role that owns one — is as unsafe as BYPASSRLS. 'MEMBER' (not 'USAGE') also catches a
// membership granted WITH INHERIT FALSE: such a member can still SET ROLE to the owner and act as it.
// pg_has_role(…, 'MEMBER') is true for every role when the current role is a superuser.
const ROLE_SAFETY_SQL = `
  SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypassrls, r.rolreplication AS replication,
         EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND pg_has_role(r.oid, c.relowner, 'MEMBER')) AS owns_tables
    FROM pg_roles r
   WHERE r.rolname = current_user`;

/** Checks the role that `query` runs as; exported for tests (they switch roles with SET ROLE). */
export async function checkRoleSafety(query: Query): Promise<void> {
  const { rows } = await query(ROLE_SAFETY_SQL);
  const row = rows[0];
  if (!row) {
    throw new UnsafeRuntimeRoleError(
      'Unsafe database role: the current role was not found in pg_roles',
    );
  }
  const problems = [
    row.superuser && 'SUPERUSER',
    row.bypassrls && 'BYPASSRLS',
    row.replication && 'REPLICATION',
    row.owns_tables && 'owns tables',
  ].filter((problem): problem is string => typeof problem === 'string');
  if (problems.length > 0) {
    throw new UnsafeRuntimeRoleError(
      `Unsafe database role for the application (${problems.join(', ')}); DATABASE_URL must name the runtime role`,
    );
  }
}

/** Throws if the connected runtime role is superuser, has BYPASSRLS or REPLICATION, or owns tables. */
export function assertSafeRuntimeRole(): Promise<void> {
  return checkRoleSafety((text) => getPool().query<RoleSafetyRow>(text));
}
