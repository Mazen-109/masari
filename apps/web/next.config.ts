import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Response headers of every path (contracts/http-and-env.md §2). They are evaluated when `next build`
// loads this file and written into the build output, so HSTS is sent only when `APP_URL` is an https
// URL at build time (docs/deployment.md).
const dev = process.env.NODE_ENV === 'development';
const https = (process.env.APP_URL ?? '').startsWith('https://');

const nextConfig: NextConfig = {
  transpilePackages: ['@masari/db'],
  poweredByHeader: false,
  // Agent guidance lives in the repository's CLAUDE.md; do not let `next dev` generate AGENTS.md.
  agentRules: false,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders({ dev, https }) }]);
  },
};

export default withNextIntl(nextConfig);
