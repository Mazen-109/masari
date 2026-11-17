// node --test scripts/ — table tests for the RTL gate (run by `pnpm test`).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  checkDirectory,
  findViolations,
  logicalEquivalent,
  splitToken,
  trimToken,
} from './check-rtl.mjs';

describe('splitToken', () => {
  it('separates variants, sign, core, and important marker', () => {
    assert.deepEqual(splitToken('md:hover:-ml-2'), {
      prefix: 'md:hover:',
      sign: '-',
      core: 'ml-2',
      important: '',
    });
    assert.deepEqual(splitToken('!pl-4'), { prefix: '', sign: '!', core: 'pl-4', important: '' });
    assert.deepEqual(splitToken('pl-4!'), { prefix: '', sign: '', core: 'pl-4', important: '!' });
  });

  it('does not split on colons inside arbitrary variants', () => {
    assert.equal(splitToken('[&:hover]:pr-2').prefix, '[&:hover]:');
    assert.equal(splitToken('[&:hover]:pr-2').core, 'pr-2');
  });
});

describe('logicalEquivalent', () => {
  const flagged = [
    ['ml-2', 'ms-2'],
    ['mr-auto', 'me-auto'],
    ['pl-4', 'ps-4'],
    ['pr-[3px]', 'pe-[3px]'],
    ['left-0', 'start-0'],
    ['right-1/2', 'end-1/2'],
    ['-ml-2', '-ms-2'],
    ['md:pl-4', 'md:ps-4'],
    ['!mr-2', '!me-2'],
    ['mr-2!', 'me-2!'],
    ['scroll-ml-4', 'scroll-ms-4'],
    ['scroll-pr-2', 'scroll-pe-2'],
    ['text-left', 'text-start'],
    ['text-right', 'text-end'],
    ['float-left', 'float-start'],
    ['clear-right', 'clear-end'],
    ['rounded-l', 'rounded-s'],
    ['rounded-l-lg', 'rounded-s-lg'],
    ['rounded-tl', 'rounded-ss'],
    ['rounded-tr-md', 'rounded-se-md'],
    ['rounded-bl-none', 'rounded-es-none'],
    ['rounded-br', 'rounded-ee'],
    ['border-r', 'border-e'],
    ['border-l-2', 'border-s-2'],
    ['sm:border-l-primary', 'sm:border-s-primary'],
  ];
  for (const [token, expected] of flagged) {
    it(`flags ${token} → ${expected}`, () => {
      assert.equal(logicalEquivalent(token), expected);
    });
  }

  it('flags origin-left with advice instead of a direct equivalent', () => {
    assert.match(logicalEquivalent('origin-left') ?? '', /rtl-ok:/);
  });

  const allowed = [
    'ms-2',
    'pe-4',
    'start-0',
    'end-0',
    'text-start',
    'text-end',
    'rounded-lg',
    'rounded-s-lg',
    'rounded-ss',
    'rounded-full',
    'rounded',
    'border-ring',
    'border-red-500',
    'border-s',
    'border',
    'px-4',
    'mx-auto',
    'inset-x-0',
    'text-sm',
    'origin-center',
    'leftover',
    'rightmost',
    'prose',
    'mlx-2',
    '--left-gap',
    'scroll-mx-2',
    'pr',
    'border-lg',
    'rounded-left',
  ];
  for (const token of allowed) {
    it(`allows ${token}`, () => {
      assert.equal(logicalEquivalent(token), null);
    });
  }
});

describe('findViolations', () => {
  it('reports file lines in class strings, template literals, and cn() calls', () => {
    const text = [
      'export function A() {',
      '  return <div className="flex ml-2 gap-2">x</div>;',
      '}',
      "const b = cn('px-2', `md:pr-4`);",
    ].join('\n');
    assert.deepEqual(findViolations(text, 'a.tsx'), [
      { line: 2, match: 'ml-2', fix: 'ms-2' },
      { line: 4, match: 'md:pr-4', fix: 'md:pe-4' },
    ]);
  });

  it('exempts lines carrying an rtl-ok: reason, but not a bare marker', () => {
    const text = [
      '<div className="ml-2" /> {/* rtl-ok: chart axis is always LTR */}',
      '<div className="ml-2" /> {/* rtl-ok: */}',
    ].join('\n');
    assert.deepEqual(
      findViolations(text, 'a.tsx').map((v) => v.line),
      [2],
    );
  });

  it('flags physical CSS declarations in CSS files only', () => {
    const css = [
      '.a { margin-left: 1rem; padding-right: 2px; }',
      '.b { left: 0; right : 0; }',
      '.c { text-align: right; }',
      '.d { margin-inline-start: 1rem; inset-inline-end: 0; text-align: start; }',
      '.e { --left-gap: 1rem; border-left-width: 0; }',
      '.f { @apply pl-2; }',
    ].join('\n');
    assert.deepEqual(findViolations(css, 'a.css'), [
      { line: 1, match: 'margin-left', fix: 'margin-inline-start' },
      { line: 1, match: 'padding-right', fix: 'padding-inline-end' },
      { line: 2, match: 'left', fix: 'inset-inline-start' },
      { line: 2, match: 'right', fix: 'inset-inline-end' },
      { line: 3, match: 'text-align: right', fix: 'text-align: end' },
      { line: 6, match: 'pl-2', fix: 'ps-2' },
    ]);
    assert.deepEqual(findViolations('const pos = { left: 0 };', 'a.ts'), []);
  });

  it('flags utilities in @apply lines despite trailing ; or }', () => {
    const css = [
      '.a { @apply text-left; }',
      '.b { @apply border-r; }',
      '.c { @apply rounded-tl; }',
      '.d { @apply float-right}',
      '.e { @apply origin-left; }',
      '.f{@apply clear-left,border-l-2;}',
      '.g { @apply text-start border-e rounded-ss float-end; }',
    ].join('\n');
    const found = findViolations(css, 'a.css').map((v) => [v.line, v.match, v.fix]);
    assert.deepEqual(
      found.map(([line, match]) => [line, match]),
      [
        [1, 'text-left'],
        [2, 'border-r'],
        [3, 'rounded-tl'],
        [4, 'float-right'],
        [5, 'origin-left'],
        [6, 'clear-left'],
        [6, 'border-l-2'],
      ],
    );
    assert.equal(found[0]?.[2], 'text-start');
    assert.equal(found[1]?.[2], 'border-e');
    assert.equal(found[2]?.[2], 'rounded-ss');
    assert.equal(found[3]?.[2], 'float-end');
  });

  it('flags physical arbitrary properties in every file type', () => {
    const tsx = [
      '<div className="[margin-left:4px] md:[left:0]" />',
      "cn('[text-align:right]', 'hover:[padding-right:1rem]', '![right:0]')",
      '<div className="[margin-inline-start:4px] [text-align:start] [&:hover]:ps-2" />',
    ].join('\n');
    assert.deepEqual(findViolations(tsx, 'a.tsx'), [
      { line: 1, match: '[margin-left:4px]', fix: '[margin-inline-start:4px]' },
      { line: 1, match: 'md:[left:0]', fix: 'md:[inset-inline-start:0]' },
      { line: 2, match: '[text-align:right]', fix: '[text-align:end]' },
      { line: 2, match: 'hover:[padding-right:1rem]', fix: 'hover:[padding-inline-end:1rem]' },
      { line: 2, match: '![right:0]', fix: '![inset-inline-end:0]' },
    ]);
    assert.deepEqual(
      findViolations('.a { @apply [margin-left:4px]; }', 'a.css').map((v) => v.match),
      ['margin-left'],
    );
  });
});

describe('trimToken', () => {
  const cases = [
    ['text-left;', 'text-left'],
    ['float-right}', 'float-right'],
    ['{border-r}', 'border-r'],
    ['pl-2),', 'pl-2'],
    ['ml-(--gap)', 'ml-(--gap)'],
    ['ml-(--gap);', 'ml-(--gap)'],
    ['pr-[3px]', 'pr-[3px]'],
  ];
  for (const [token, expected] of cases) {
    it(`trims ${token} → ${expected}`, () => {
      assert.equal(trimToken(token), expected);
    });
  }
});

describe('checkDirectory', () => {
  it('formats file:line: match → use equivalent and scans only ts/tsx/css', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rtl-check-'));
    try {
      mkdirSync(path.join(dir, 'components'));
      writeFileSync(path.join(dir, 'components', 'x.tsx'), 'const c = "ml-2";\n');
      writeFileSync(path.join(dir, 'ok.ts'), 'const c = "ms-2";\n');
      writeFileSync(path.join(dir, 'notes.md'), 'ml-2\n');
      const { files, lines } = checkDirectory(dir);
      assert.equal(files, 2);
      assert.equal(lines.length, 1);
      assert.match(lines[0] ?? '', /components\/x\.tsx:1: ml-2 → use ms-2$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes on the real apps/web/src tree', () => {
    assert.deepEqual(checkDirectory().lines, []);
  });
});
