import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Guard coverage (contracts/permissions.md §3, routes.md §1 "Guards"): every page file (`page.tsx`,
 * `page.ts`, `page.jsx`, `page.js`) under
 * `[locale]/(app)` and `[locale]/(onboarding)` must call `requireSession(` or `requirePermission(` itself —
 * a layout guard is not enough. Comments do not count as a call.
 */

const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const GUARDED_GROUPS = ['(app)', '(onboarding)'];
const GUARD_CALL = /\brequire(?:Session|Permission)\(/;
const PAGE_FILE = /^page\.(t|j)sx?$/;

async function listPages(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    // A route group that does not exist yet has no pages to check.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && PAGE_FILE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Removes block and line comments. A `//` preceded by `:` is kept (a URL such as `https://…` in a string);
 * any other `//` starts a comment, even directly after code (`foo();//requireSession(`).
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Pages under the guarded route groups of `appDir` that contain no guard call, relative to `appDir`. */
async function findUnguardedPages(appDir: string): Promise<string[]> {
  const unguarded: string[] = [];
  for (const group of GUARDED_GROUPS) {
    for (const page of await listPages(join(appDir, '[locale]', group))) {
      if (!GUARD_CALL.test(withoutComments(await readFile(page, 'utf8')))) {
        unguarded.push(relative(appDir, page));
      }
    }
  }
  return unguarded.sort();
}

describe('guard coverage', () => {
  it('every page under [locale]/(app) and [locale]/(onboarding) calls a guard', async () => {
    expect(await findUnguardedPages(APP_DIR)).toEqual([]);
  });

  // The scan itself, on a throw-away app directory: proves the test above fails when a page without a
  // guard is added.
  describe('scanner', () => {
    let fixture: string | undefined;

    afterEach(async () => {
      if (fixture !== undefined) await rm(fixture, { recursive: true, force: true });
      fixture = undefined;
    });

    async function page(path: string, source: string): Promise<void> {
      fixture ??= await mkdtemp(join(tmpdir(), 'guard-coverage-'));
      const file = join(fixture, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, source);
    }

    it('reports pages without a guard call, at any depth, in both groups', async () => {
      await page('[locale]/(app)/dashboard/page.tsx', "await requireSession('/dashboard');");
      await page(
        '[locale]/(app)/admin/users/page.tsx',
        "await requirePermission('admin.users.manage', '/admin/users');",
      );
      await page(
        '[locale]/(app)/modules/[key]/page.tsx',
        'export default function Page() { return null; }',
      );
      await page(
        '[locale]/(onboarding)/onboarding/page.tsx',
        'export default async function Page() {}',
      );
      await page('[locale]/(app)/layout.tsx', 'no guard needed in layouts for this scan');
      await page('[locale]/(public)/sign-in/page.tsx', 'public page');
      expect(await findUnguardedPages(fixture ?? '')).toEqual([
        join('[locale]', '(app)', 'modules', '[key]', 'page.tsx'),
        join('[locale]', '(onboarding)', 'onboarding', 'page.tsx'),
      ]);
    });

    it('does not count a guard that is only mentioned in a comment', async () => {
      await page('[locale]/(app)/a/page.tsx', "// await requireSession('/a');\nexport default 1;");
      await page(
        '[locale]/(app)/b/page.tsx',
        "/* requirePermission('x', '/b') */\nexport default 1;",
      );
      expect(await findUnguardedPages(fixture ?? '')).toHaveLength(2);
    });

    it('does not count a guard in a line comment written directly after code', async () => {
      await page(
        '[locale]/(app)/a/page.tsx',
        "export default 1;//await requireSession('/a');\nconst x = 2;// requirePermission('y', '/a')",
      );
      expect(await findUnguardedPages(fixture ?? '')).toEqual([
        join('[locale]', '(app)', 'a', 'page.tsx'),
      ]);
    });

    it('keeps code after a URL in a string (the `//` of `https://` is not a comment)', async () => {
      await page(
        '[locale]/(app)/a/page.tsx',
        "const u = 'https://example.test'; await requireSession('/a');",
      );
      expect(await findUnguardedPages(fixture ?? '')).toEqual([]);
    });

    it('scans page.ts, page.tsx, page.js, and page.jsx, and nothing else', async () => {
      for (const name of ['page.ts', 'page.tsx', 'page.js', 'page.jsx']) {
        await page(`[locale]/(app)/${name.replace('.', '-')}/${name}`, 'export default 1;');
      }
      await page('[locale]/(app)/other/page.mdx', 'export default 1;');
      await page('[locale]/(app)/other/page.test.tsx', 'export default 1;');
      await page('[locale]/(app)/other/my-page.tsx', 'export default 1;');
      expect(await findUnguardedPages(fixture ?? '')).toEqual(
        [
          join('[locale]', '(app)', 'page-js', 'page.js'),
          join('[locale]', '(app)', 'page-jsx', 'page.jsx'),
          join('[locale]', '(app)', 'page-ts', 'page.ts'),
          join('[locale]', '(app)', 'page-tsx', 'page.tsx'),
        ].sort(),
      );
    });

    it('finds nothing to report when the route groups do not exist', async () => {
      await page('[locale]/page.tsx', 'export default 1;');
      expect(await findUnguardedPages(fixture ?? '')).toEqual([]);
    });
  });
});
