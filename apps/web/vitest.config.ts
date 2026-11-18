import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'src/server/**',
        'src/lib/**',
        'src/modules/**',
        'src/features/**/schemas.ts',
        'src/features/**/rules.ts',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/server/auth/auth.ts',
        'src/server/auth/session.ts',
        'src/server/auth/action-context.ts',
        'src/server/email/transport.ts',
      ],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
