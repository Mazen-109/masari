// `pnpm tenant:create` (contracts/cli.md §4, FR-018): creates a college, its GEN division, and its first
// administrator invitation in one transaction (createTenantWithAdmin) and prints the invitation link once.
// The link is never stored in plain form; nothing else personal is printed (not even the email).
// Exit codes: 0 created · 1 refused or failed (nothing changed) · 2 invalid arguments.
import {
  createTenantWithAdmin,
  getAdminDbEnv,
  parseTenantCreateArgs,
  safeFailureReason,
  TENANT_CREATE_USAGE,
} from '../src/admin';

async function main(): Promise<void> {
  const args = parseTenantCreateArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`${args.problem}\n${TENANT_CREATE_USAGE}`);
    process.exitCode = 2;
    return;
  }
  const env = getAdminDbEnv();
  if (env.APP_URL === undefined) {
    console.error('APP_URL is not set; it is needed for the invitation link. Nothing was changed.');
    process.exitCode = 1;
    return;
  }
  const result = await createTenantWithAdmin(env.DATABASE_MIGRATION_URL, args.value);
  if (!result.ok) {
    console.error(
      result.reason === 'slug_taken'
        ? `A college with slug "${args.value.slug}" already exists. Nothing was changed.`
        : 'This email already has an account. Nothing was changed.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`College created: ${args.value.slug}`);
  console.log(`Admin invitation link (valid 7 days): ${env.APP_URL}/ar/invite/${result.token}`);
}

main().catch((error: unknown) => {
  console.error(`Creating the college failed: ${safeFailureReason(error)}. Nothing was changed.`);
  process.exitCode = 1;
});
