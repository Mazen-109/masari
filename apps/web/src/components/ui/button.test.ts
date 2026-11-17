import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

const render = (props: Parameters<typeof Button>[0], child: string) =>
  renderToStaticMarkup(createElement(Button, props, child));

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    expect(render({}, 'x')).toMatch(/^<button[^>]* type="button"/);
  });

  it('keeps an explicit type', () => {
    expect(render({ type: 'submit' }, 'x')).toContain('type="submit"');
  });

  it('renders the child with button styles and no type when asChild is set', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { asChild: true }, createElement('a', { href: '/x' }, 'x')),
    );
    expect(html).toMatch(/^<a /);
    expect(html).not.toContain('type=');
    expect(html).toContain('bg-primary');
    expect(html).toContain('min-h-11');
  });
});
