-- Custom SQL migration: runtime grants for the auth-library tables (data-model.md §1, §3.2, §3.3). Global
-- tables without row-level security: the library must find a user by email and a session by token before
-- any college is known. Compensating controls: only the auth library and the `users` / `sessions`
-- repositories query them, and the web app cannot import the raw database handle (ESLint).
GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO masari_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sessions" TO masari_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounts" TO masari_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verifications" TO masari_app;
