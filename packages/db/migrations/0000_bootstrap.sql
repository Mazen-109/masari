-- Custom SQL migration: bootstrap objects (data-model.md §2).
-- Group role that receives every runtime grant. It has no password and cannot log in; the web app's login
-- role is created and made a member by `pnpm db:migrate` (ensureRuntimeRole), never by a migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'masari_app') THEN
    CREATE ROLE masari_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- Current college from the transaction-local setting; NULL when unset or empty (fail closed).
CREATE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
