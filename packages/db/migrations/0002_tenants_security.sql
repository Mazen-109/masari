-- Custom SQL migration: row-level security and runtime grants for `tenants` (data-model.md §1, §3.1).
-- Global table (tenant registry): RLS is enabled but not forced, so the owner (operator scripts) is not
-- subject to it. The runtime role may read every college and update only the college in context, and only
-- the settings columns. No INSERT/DELETE grant or policy: colleges are created by operator scripts only.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_select ON "tenants" FOR SELECT TO masari_app
  USING (true);
--> statement-breakpoint
CREATE POLICY tenants_update ON "tenants" FOR UPDATE TO masari_app
  USING (id = app_tenant_id())
  WITH CHECK (id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT ON "tenants" TO masari_app;
--> statement-breakpoint
GRANT UPDATE (name_ar, name_en, allowed_email_domains, levels_count, enabled_modules, updated_at)
  ON "tenants" TO masari_app;
