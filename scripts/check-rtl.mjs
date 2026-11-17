#!/usr/bin/env node
// pnpm rtl:check — contracts/cli.md §1.
// Exits 1 when a file under apps/web/src (*.ts, *.tsx, *.css) uses a physical-direction Tailwind
// utility (ml-*, pr-*, left-*, text-right, rounded-l-*, border-r, …) or, in CSS, a physical-direction
// declaration (margin-left, padding-right, left:, right:, text-align: left|right). Logical
// equivalents (ms-*, pe-*, start-*, text-end, …) work in both directions (constitution IV).
// A line containing `rtl-ok:` followed by a reason is exempt.
// Output: `file:line: <match> → use <logical equivalent>`.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIR = path.join(ROOT, 'apps/web/src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
// The marker must be followed by a reason (a letter or digit), not just a comment terminator.
const EXEMPTION = /rtl-ok:\s*[\p{L}\p{N}]/u;

const SIDE = { l: 's', r: 'e' };
const CORNER = { l: 's', r: 'e', tl: 'ss', tr: 'se', bl: 'es', br: 'ee' };
const SPACING = {
  ml: 'ms',
  mr: 'me',
  pl: 'ps',
  pr: 'pe',
  left: 'start',
  right: 'end',
  'scroll-ml': 'scroll-ms',
  'scroll-mr': 'scroll-me',
  'scroll-pl': 'scroll-ps',
  'scroll-pr': 'scroll-pe',
};

/**
 * Class-token rules: each returns the logical replacement of the bare utility, or null.
 * @type {Array<(core: string) => string | null>}
 */
const UTILITY_RULES = [
  (core) => {
    const m = /^(scroll-ml|scroll-mr|scroll-pl|scroll-pr|ml|mr|pl|pr|left|right)-(.+)$/.exec(core);
    return m ? `${SPACING[/** @type {keyof typeof SPACING} */ (m[1])]}-${m[2]}` : null;
  },
  (core) => {
    const m = /^(text|float|clear|origin)-(left|right)$/.exec(core);
    if (!m) return null;
    if (m[1] === 'origin') return 'origin-center, or rtl:/ltr: variants on a line marked rtl-ok:';
    return `${m[1]}-${m[2] === 'left' ? 'start' : 'end'}`;
  },
  (core) => {
    const m = /^rounded-(tl|tr|bl|br|l|r)(-.+)?$/.exec(core);
    return m ? `rounded-${CORNER[/** @type {keyof typeof CORNER} */ (m[1])]}${m[2] ?? ''}` : null;
  },
  (core) => {
    const m = /^border-(l|r)(-.+)?$/.exec(core);
    return m ? `border-${SIDE[/** @type {keyof typeof SIDE} */ (m[1])]}${m[2] ?? ''}` : null;
  },
];

/** CSS declaration rules (CSS files only; in TS a `left:` key is usually not a style). */
const DECLARATION_RULES = [
  {
    pattern: /(?<![\w-])(margin|padding)-(left|right)(?=\s*:)/g,
    fix: (/** @type {RegExpExecArray} */ m) =>
      `${m[1]}-inline-${m[2] === 'left' ? 'start' : 'end'}`,
  },
  {
    pattern: /(?<![\w-])(left|right)(?=\s*:)/g,
    fix: (/** @type {RegExpExecArray} */ m) => `inset-inline-${m[1] === 'left' ? 'start' : 'end'}`,
  },
  {
    pattern: /(?<![\w-])text-align\s*:\s*(left|right)\b/g,
    fix: (/** @type {RegExpExecArray} */ m) => `text-align: ${m[1] === 'left' ? 'start' : 'end'}`,
  },
];

/**
 * Splits a class token into its variant prefix (`md:hover:`), sign (`!`, `-`), core utility, and
 * trailing important marker. Colons inside `[...]` arbitrary variants do not split.
 * @param {string} token
 */
export function splitToken(token) {
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) lastColon = i;
  }
  const prefix = token.slice(0, lastColon + 1);
  let rest = token.slice(lastColon + 1);
  // One leading `!` (v3 important) and/or one `-` (negative value); `--custom-property` stays intact.
  const sign = /^!?-?/.exec(rest)?.[0] ?? '';
  rest = rest.slice(sign.length);
  const important = rest.endsWith('!') ? '!' : '';
  const core = important ? rest.slice(0, -1) : rest;
  return { prefix, sign, core, important };
}

/**
 * Returns the logical replacement for a physical-direction class token, or null when the token is
 * fine. The variant prefix and sign are kept: `-ml-2` → `-ms-2`, `md:pl-4` → `md:ps-4`.
 * @param {string} token
 */
export function logicalEquivalent(token) {
  const { prefix, sign, core, important } = splitToken(token);
  for (const rule of UTILITY_RULES) {
    const fixed = rule(core);
    if (fixed !== null) return `${prefix}${sign}${fixed}${important}`;
  }
  return null;
}

/**
 * @typedef {{ line: number, match: string, fix: string }} Violation
 * @param {string} text file content
 * @param {string} file path (decides whether CSS declaration rules apply)
 * @returns {Violation[]}
 */
export function findViolations(text, file) {
  const isCss = file.endsWith('.css');
  /** @type {Violation[]} */
  const violations = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    if (EXEMPTION.test(lineText)) return;
    const line = index + 1;
    for (const token of lineText.split(/[\s'"`]+/)) {
      if (!token) continue;
      const fix = logicalEquivalent(token);
      if (fix !== null) violations.push({ line, match: token, fix });
    }
    if (!isCss) return;
    for (const rule of DECLARATION_RULES) {
      for (const m of lineText.matchAll(rule.pattern)) {
        violations.push({ line, match: m[0], fix: rule.fix(m) });
      }
    }
  });
  return violations;
}

/** @param {string} dir */
function listFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files.sort();
}

/**
 * Scans `dir` and returns one formatted line per violation.
 * @param {string} [dir]
 */
export function checkDirectory(dir = SCAN_DIR) {
  const lines = [];
  const files = listFiles(dir);
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    for (const v of findViolations(readFileSync(file, 'utf8'), file)) {
      lines.push(`${relative}:${v.line}: ${v.match} → use ${v.fix}`);
    }
  }
  return { files: files.length, lines };
}

function main() {
  const { files, lines } = checkDirectory();
  if (lines.length > 0) {
    process.stderr.write(`${lines.join('\n')}\n`);
    process.stderr.write(
      `rtl check failed: ${lines.length} physical-direction usage(s). Use the logical utility, or add "rtl-ok: <reason>" to the line.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`rtl check passed: ${files} files\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
