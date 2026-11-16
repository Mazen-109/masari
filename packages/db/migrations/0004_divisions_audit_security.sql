-- Custom SQL migration: row-level security and runtime grants for `divisions` and `audit_events`
-- (data-model.md §1, §2, §3.5, §3.8). Both are tenant-scoped: RLS is enabled AND forced, so even the table
-- owner sees only the college in context. `audit_events` is append-only for the runtime role (no UPDATE or
-- DELETE grant); `divisions` are never deleted (no DELETE grant).
ALTER TABLE "divisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "divisions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "divisions"
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "divisions" TO masari_app;
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_events"
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_events" TO masari_app;
