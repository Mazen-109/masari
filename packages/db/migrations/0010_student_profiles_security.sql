-- Custom SQL migration: row-level security and runtime grants for `student_profiles` (data-model.md §1,
-- §3.6). Tenant-scoped: RLS is enabled AND forced, so even the table owner sees only the college in
-- context. Profiles are never deleted by the application (no DELETE grant); they go only with their account
-- (ON DELETE CASCADE from `users`).
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_profiles"
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "student_profiles" TO masari_app;
