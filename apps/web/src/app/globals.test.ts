import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards for the global stylesheet rules that axe cannot see (DESIGN.md "Focus ring", "Links").
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Innermost `selector { declarations }` blocks, with whitespace collapsed. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
  body: (m[2] ?? '').replace(/\s+/g, ' '),
}));

describe('globals.css focus styles', () => {
  it('draws a 2 px ring on :focus-visible', () => {
    const ring = rules.find((r) => r.selector === ':focus-visible');
    expect(ring?.body).toContain('outline: 2px solid var(--color-ring)');
  });

  it('removes the outline only on the skip-link target <main tabindex="-1">', () => {
    const removing = rules.filter((r) => /outline:\s*(none|0)\b/.test(r.body));
    expect(removing.map((r) => r.selector)).toEqual(["main[tabindex='-1']:focus"]);
  });
});

describe('globals.css links', () => {
  it('underlines links inside running text', () => {
    const inline = rules.find(
      (r) => r.selector.startsWith(':where(p,') && r.selector.endsWith(' a'),
    );
    expect(inline?.body).toContain('text-decoration-line: underline');
  });
});
