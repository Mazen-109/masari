// `pnpm tenant:set-status` (contracts/cli.md §5, FR-018, FR-019): suspends or reactivates a college. Changes
// the status only — sessions are not deleted; every request re-checks the college status.
// Exit codes: 0 updated · 1 college not found or failed · 2 invalid arguments.
import {
  getAdminDbEnv,
  parseTenantSetStatusArgs,
  safeFailureReason,
  setTenantStatus,
  TENANT_SET_STATUS_USAGE,
} from '../src/admin';

async function main(): Promise<void> {
  const args = parseTenantSetStatusArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`${args.problem}\n${TENANT_SET_STATUS_USAGE}`);
    process.exitCode = 2;
    return;
  }
  const env = getAdminDbEnv();
  const outcome = await setTenantStatus(
    env.DATABASE_MIGRATION_URL,
    args.value.slug,
    args.value.status,
  );
  if (outcome === 'not_found') {
    console.error('College not found');
    process.exitCode = 1;
    return;
  }
  console.log(`College ${args.value.slug} is now ${args.value.status}`);
}

main().catch((error: unknown) => {
  console.error(`Changing the college status failed: ${safeFailureReason(error)}`);
  process.exitCode = 1;
});
