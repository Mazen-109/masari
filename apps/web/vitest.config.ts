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
    // next-intl's ESM build imports `next/server` without an extension, which Node's resolver refuses
    // (Next.js has no `exports` map); inlined, it is resolved by Vite (src/proxy.test.ts).
    server: { deps: { inline: ['next-intl'] } },
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
