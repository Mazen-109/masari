import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail, TEXT_DIVIDER, type BilingualEmail } from './layout';

const LINK = 'https://masari.test/ar/invite/abc?x=1&y=2';

const EMAIL: BilingualEmail = {
  subject: { ar: 'عنوان', en: 'Subject' },
  ar: {
    paragraphs: ['مرحبًا'],
    links: [{ label: 'افتح', url: LINK }],
    notes: ['صالح لمدة 24 ساعة.'],
  },
  en: {
    paragraphs: ['Hello'],
    links: [{ label: 'Open', url: LINK }],
    notes: ['Valid for 24 hours.'],
  },
};

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
    expect(escapeHtml('نص عادي')).toBe('نص عادي');
  });
});

describe('renderEmail', () => {
  it('joins the subject as "<Arabic> | <English>" on one line', () => {
    const { subject } = renderEmail({
      ...EMAIL,
      subject: { ar: 'سطر\r\nثانٍ', en: ' Two\nlines ' },
    });
    expect(subject).toBe('سطر ثانٍ | Two lines');
  });

  it('puts the Arabic RTL block before the divider and the English LTR block', () => {
    const { html } = renderEmail(EMAIL);
    const arStart = html.indexOf('<div dir="rtl" lang="ar"');
    const divider = html.indexOf('<hr');
    const enStart = html.indexOf('<div dir="ltr" lang="en"');
    expect(arStart).toBeGreaterThan(-1);
    expect(arStart).toBeLessThan(divider);
    expect(divider).toBeLessThan(enStart);
  });

  it('writes the plain text Arabic first, with each LINK on its own line', () => {
    const { text } = renderEmail(EMAIL);
    const [arText, enText, ...rest] = text.split(TEXT_DIVIDER);
    expect(rest).toEqual([]);
    expect(arText).toContain('مرحبًا');
    expect(enText).toContain('Hello');
    for (const part of [arText, enText]) expect(part?.split('\n')).toContain(LINK);
  });

  it('renders each link as a button and as visible, escaped text', () => {
    const { html } = renderEmail(EMAIL);
    const escaped = escapeHtml(LINK);
    expect(html).toContain(`href="${escaped}"`);
    expect(html).toContain(`>${escaped}</a>`);
    expect(html).toContain('>افتح</a>');
    expect(html).toContain('>Open</a>');
    expect(html).not.toContain('&y=');
  });

  it('ends each language with the footer, naming the college when known', () => {
    const generic = renderEmail(EMAIL);
    expect(generic.text).toContain('نيابةً عن كليتك');
    expect(generic.text).toContain('on behalf of your college');

    const named = renderEmail({ ...EMAIL, collegeName: { ar: 'كلية الحاسبات', en: 'Computing' } });
    const [arText, enText] = named.text.split(TEXT_DIVIDER);
    expect(arText?.trimEnd().endsWith('فيمكنك تجاهلها.')).toBe(true);
    expect(arText).toContain('نيابةً عن كلية الحاسبات');
    expect(enText?.trimEnd().endsWith('you can ignore it.')).toBe(true);
    expect(enText).toContain('on behalf of Computing');
  });

  it('uses inline CSS only: no style sheets, images, scripts, or external resources', () => {
    const { html } = renderEmail(EMAIL);
    for (const tag of ['<style', '<link', '<img', '<script', 'src=', 'url(']) {
      expect(html).not.toContain(tag);
    }
  });

  it('escapes every value, including paragraphs, labels, and college names', () => {
    const attack = '<script>alert(1)</script>';
    const { html } = renderEmail({
      subject: { ar: attack, en: attack },
      ar: { paragraphs: [attack], links: [{ label: attack, url: LINK }], notes: [attack] },
      en: { paragraphs: [attack] },
      collegeName: { ar: attack, en: attack },
    });
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it.each(['javascript:alert(1)', '/ar/sign-in', 'not a url', 'mailto:a@b.test'])(
    'refuses the link %s',
    (url) => {
      expect(() =>
        renderEmail({ ...EMAIL, en: { paragraphs: ['x'], links: [{ label: 'x', url }] } }),
      ).toThrow('Email links must be absolute http(s) URLs');
    },
  );
});
