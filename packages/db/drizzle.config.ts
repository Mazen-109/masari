import { defineConfig } from 'drizzle-kit';

// Used only by `pnpm db:generate` (drizzle-kit generate), which needs no database connection.
// Migrations are applied by `pnpm db:migrate` (scripts/migrate.ts), never by drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
});
