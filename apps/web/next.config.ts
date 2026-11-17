import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@masari/db'],
  poweredByHeader: false,
  // Agent guidance lives in the repository's CLAUDE.md; do not let `next dev` generate AGENTS.md.
  agentRules: false,
};

export default withNextIntl(nextConfig);
