import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `Link` of navigation.tsx is for server components only (PR-40): in a client component it would need
// next-intl's client provider, which pages no longer render. The project has no `server-only` package,
// so this test stands in for it: no `'use client'` module imports navigation.tsx.
const srcDir = fileURLToPath(new URL('..', import.meta.url));
const clientModules = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(srcDir, name), 'utf8') }))
  .filter(({ text }) => /^\s*['"]use client['"]/.test(text));

describe('server Link', () => {
  it('finds the client modules', () => {
    expect(clientModules.map(({ name }) => name)).toContain(join('i18n', 'client-link.tsx'));
  });

  it.each(clientModules.map(({ name, text }) => [name, text] as const))(
    '%s does not import @/i18n/navigation',
    (_name, text) => {
      expect(text).not.toMatch(/from\s+['"](@\/i18n\/navigation|\.\.?\/(i18n\/)?navigation)['"]/);
    },
  );
});
