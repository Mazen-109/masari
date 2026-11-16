-- Custom SQL migration: runtime grants for `rate_limit_counters` (data-model.md §1, §3.4). Global
-- infrastructure table: no tenant data and no RLS. The runtime role counts hits and purges old windows.
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit_counters" TO masari_app;
