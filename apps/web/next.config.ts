import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import {
  contentSecurityPolicy,
  CSP_HEADER,
  PROXY_FREE_PATHS,
  securityHeaders,
} from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Response headers (contracts/http-and-env.md §2). Evaluated when the configuration is loaded, so the
// production values are fixed by `next build`: `APP_URL` must be set there for HSTS to be sent.
const dev = process.env.NODE_ENV === 'development';
const https = (process.env.APP_URL ?? '').startsWith('https://');

const nextConfig: NextConfig = {
  transpilePackages: ['@masari/db'],
  poweredByHeader: false,
  // Agent guidance lives in the repository's CLAUDE.md; do not let `next dev` generate AGENTS.md.
  agentRules: false,
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders({ https }) },
      // Pages get their CSP, with a per-request script nonce, from src/proxy.ts; the paths the proxy
      // skips get the same policy without a nonce here.
      ...PROXY_FREE_PATHS.map((source) => ({
        source,
        headers: [{ key: CSP_HEADER, value: contentSecurityPolicy({ dev }) }],
      })),
    ]);
  },
};

export default withNextIntl(nextConfig);
