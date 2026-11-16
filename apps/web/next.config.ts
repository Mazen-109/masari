import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@masari/db'],
  poweredByHeader: false,
  // Agent guidance lives in the repository's CLAUDE.md; do not let `next dev` generate AGENTS.md.
  agentRules: false,
};

export default nextConfig;
