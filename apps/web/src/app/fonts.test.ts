import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards for the font setup of fonts.ts and globals.css (PR-39, FR-043): two weights, swap, one preload,
// Arabic faces last, and a metric-matched fallback. The e2e font budget (perf-budget.spec.ts) checks
// what a browser really downloads.
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const fontsTs = read('./fonts.ts');
const css = read('./globals.css');

/** The option text of every `localFont({ … })` call, in source order. */
const calls = fontsTs
  .split(/localFont\(\{/)
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf('\n});')));

const fileOf = (call: string) => /files\/ibm-plex-sans-arabic-(\w+)-(\d+)-normal\.woff2/.exec(call);

describe('fonts.ts', () => {
  it('declares the Arabic and Latin files of weights 400 and 700 only, Latin first', () => {
    expect(calls.map((call) => fileOf(call)?.slice(1, 3).join('-'))).toEqual([
      'latin-400',
      'latin-700',
      'arabic-400',
      'arabic-700',
    ]);
    for (const call of calls) {
      expect(call).toContain(`weight: '${fileOf(call)?.[2] ?? ''}'`);
    }
  });

  it('names one family, swaps, and preloads only the Arabic 400 file', () => {
    for (const call of calls) {
      expect(call).toContain(`{ prop: 'font-family', value: "'IBM Plex Sans Arabic'" }`);
      expect(call).toContain(`display: 'swap'`);
      expect(call).toContain('adjustFontFallback: false');
    }
    const preloaded = calls.filter((call) => call.includes('preload: true'));
    expect(preloaded.map((call) => fileOf(call)?.[0])).toEqual([
      'files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
    ]);
    expect(calls.filter((call) => call.includes('preload: false'))).toHaveLength(3);
  });

  it('lets the Arabic faces claim the space characters, so Arabic text needs no Latin file', () => {
    for (const call of calls) {
      const range = /'(U\+[^']+)'/.exec(call)?.[1] ?? '';
      const claimsSpaces = range.startsWith('U+0020,U+00A0,');
      expect(claimsSpaces).toBe(fileOf(call)?.[1] === 'arabic');
    }
  });
});

describe('globals.css fonts', () => {
  it('no longer imports the @fontsource stylesheets', () => {
    expect(css).not.toContain('@fontsource');
  });

  it('maps every weight utility to a loaded weight and removes the others', () => {
    expect(css).toMatch(/--font-weight-normal: 400;/);
    expect(css).toMatch(/--font-weight-medium: 400;/);
    expect(css).toMatch(/--font-weight-semibold: 700;/);
    expect(css).toMatch(/--font-weight-bold: 700;/);
    for (const removed of ['thin', 'extralight', 'light', 'extrabold', 'black']) {
      expect(css).toContain(`--font-weight-${removed}: initial;`);
    }
  });

  it('puts a metric-matched fallback for each weight right after the web font', () => {
    expect(css).toMatch(/--font-sans:\s*'IBM Plex Sans Arabic', 'IBM Plex Sans Arabic Fallback',/);
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
    expect(faces).toHaveLength(2);
    for (const [index, weight] of ['400', '700'].entries()) {
      const face = faces[index] ?? '';
      expect(face).toContain(`font-family: 'IBM Plex Sans Arabic Fallback';`);
      expect(face).toContain(`font-weight: ${weight};`);
      expect(face).toMatch(/src: local\(/);
      for (const descriptor of ['size-adjust', 'ascent-override', 'descent-override']) {
        expect(face).toMatch(new RegExp(`${descriptor}: \\d+(\\.\\d+)?%;`));
      }
      expect(face).toContain('line-gap-override: 0%;');
    }
  });
});

describe('font imports', () => {
  // Every file that loads globals.css renders `<html>` and must also load fonts.ts, or that screen falls
  // back to system fonts (PR-39 review).
  const appDir = fileURLToPath(new URL('.', import.meta.url));
  const sources = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => ({ name, text: readFileSync(join(appDir, name), 'utf8') }));
  const importsOf = (text: string) => [...text.matchAll(/^import\s+'([^']+)';/gm)].map((m) => m[1]);
  const withGlobals = sources.filter(({ text }) =>
    importsOf(text).some((path) => path?.endsWith('/globals.css')),
  );

  it('finds the files that load globals.css', () => {
    expect(withGlobals.map(({ name }) => name).sort()).toEqual(
      expect.arrayContaining(['global-error.tsx', 'not-found.tsx']),
    );
    expect(withGlobals.length).toBeGreaterThanOrEqual(3);
  });

  it.each(withGlobals.map(({ name, text }) => [name, text] as const))(
    '%s also imports fonts.ts',
    (_name, text) => {
      expect(importsOf(text).some((path) => path?.endsWith('/fonts'))).toBe(true);
    },
  );
});
