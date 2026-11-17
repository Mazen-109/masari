-- Custom SQL migration: row-level security and runtime grants for `invitations` (data-model.md §1, §3.7).
-- Tenant-scoped: RLS is enabled AND forced, so even the table owner sees only the college in context.
-- `invitation_token_lookup` additionally lets an anonymous transaction (withInvitationToken, no college in
-- context) read the one invitation whose token hash it already knows — knowing the token is the capability.
-- It is FOR SELECT only: claiming, releasing, and revoking always run inside the invitation's college.
-- Invitations are never deleted by the application (no DELETE grant); revoked ones stay as history.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invitations"
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY invitation_token_lookup ON "invitations" FOR SELECT
  USING (token_hash = nullif(current_setting('app.invite_token_hash', true), ''));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "invitations" TO masari_app;
