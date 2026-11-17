/**
 * Shared frame of every transactional email (contracts/emails.md §2, FR-038): an Arabic block
 * (`<div dir="rtl" lang="ar">`), a divider, then an English block (`<div dir="ltr" lang="en">`); the
 * plain-text part has the same content, Arabic first. Every value is HTML-escaped here, so templates pass
 * plain strings only. Links render as a button **and** as visible text (on their own line in `text`).
 * Inline CSS only: no images, external resources, or tracking; system font stack.
 */

export type EmailLink = { label: string; url: string };

/** One language's content, rendered in this order: paragraphs, links, notes, footer. */
export type EmailBlock = {
  paragraphs: readonly string[];
  links?: readonly EmailLink[];
  notes?: readonly string[];
};

export type BilingualEmail = {
  subject: { ar: string; en: string };
  ar: EmailBlock;
  en: EmailBlock;
  /** The sending college, when known; the footer names it in the matching language. */
  collegeName?: { ar: string; en: string };
};

export type RenderedEmail = { subject: string; text: string; html: string };

/** Separates the Arabic and English parts of `text`. */
export const TEXT_DIVIDER = `\n\n${'-'.repeat(32)}\n\n`;

// Mirrors the DESIGN.md tokens (email clients cannot read CSS variables).
const COLORS = {
  background: '#FBFAF7',
  surface: '#FFFFFF',
  foreground: '#18212B',
  mutedForeground: '#525C69',
  primary: '#0E5A5C',
  primaryForeground: '#FFFFFF',
  border: '#DDD8CE',
} as const;

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Only absolute http(s) URLs may become links (no `javascript:` or relative URLs). */
function assertHttpUrl(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('Email links must be absolute http(s) URLs');
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('Email links must be absolute http(s) URLs');
  }
}

/** Subjects are one header line: `"<Arabic> | <English>"`. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function footer(lang: 'ar' | 'en', collegeName: BilingualEmail['collegeName']): string {
  if (lang === 'ar') {
    const college = collegeName?.ar ?? 'كليتك';
    return `أُرسلت هذه الرسالة من مساري نيابةً عن ${college}. إذا لم تكن تتوقعها فيمكنك تجاهلها.`;
  }
  const college = collegeName?.en ?? 'your college';
  return `This email was sent by Masari on behalf of ${college}. If you were not expecting it, you can ignore it.`;
}

function blockText(block: EmailBlock, footerText: string): string {
  const parts = [
    ...block.paragraphs,
    ...(block.links ?? []).map(({ label, url }) => `${label}:\n${url}`),
    ...(block.notes ?? []),
    footerText,
  ];
  return parts.join('\n\n');
}

const PARAGRAPH_STYLE = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLORS.foreground}`;
const NOTE_STYLE = `margin:0 0 16px;font-size:14px;line-height:1.6;color:${COLORS.mutedForeground}`;
const BUTTON_STYLE = [
  'display:inline-block',
  'padding:12px 20px',
  `background:${COLORS.primary}`,
  `color:${COLORS.primaryForeground}`,
  'font-size:16px',
  'font-weight:600',
  'text-decoration:none',
  'border-radius:6px',
].join(';');
const URL_STYLE = `margin:0 0 16px;font-size:13px;line-height:1.5;color:${COLORS.mutedForeground};word-break:break-all`;
const FOOTER_STYLE = `margin:24px 0 0;font-size:13px;line-height:1.6;color:${COLORS.mutedForeground}`;

function linkHtml({ label, url }: EmailLink): string {
  const href = escapeHtml(url);
  return (
    `<p style="margin:0 0 8px"><a href="${href}" style="${BUTTON_STYLE}">${escapeHtml(label)}</a></p>` +
    `<p style="${URL_STYLE}"><a href="${href}" dir="ltr" style="color:${COLORS.primary}">${href}</a></p>`
  );
}

function blockHtml(lang: 'ar' | 'en', block: EmailBlock, footerText: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const body = [
    ...block.paragraphs.map((text) => `<p style="${PARAGRAPH_STYLE}">${escapeHtml(text)}</p>`),
    ...(block.links ?? []).map(linkHtml),
    ...(block.notes ?? []).map((text) => `<p style="${NOTE_STYLE}">${escapeHtml(text)}</p>`),
    `<p style="${FOOTER_STYLE}">${escapeHtml(footerText)}</p>`,
  ].join('');
  return `<div dir="${dir}" lang="${lang}" style="text-align:${align}">${body}</div>`;
}

export function renderEmail({ subject, ar, en, collegeName }: BilingualEmail): RenderedEmail {
  for (const link of [...(ar.links ?? []), ...(en.links ?? [])]) assertHttpUrl(link.url);

  const fullSubject = `${oneLine(subject.ar)} | ${oneLine(subject.en)}`;
  const arFooter = footer('ar', collegeName);
  const enFooter = footer('en', collegeName);

  const text = `${blockText(ar, arFooter)}${TEXT_DIVIDER}${blockText(en, enFooter)}\n`;

  const html =
    '<!doctype html>' +
    // Language and direction are set per block, so the root carries neither.
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(fullSubject)}</title></head>` +
    `<body style="margin:0;padding:24px 12px;background:${COLORS.background};font-family:${FONT_STACK}">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:8px">` +
    blockHtml('ar', ar, arFooter) +
    `<hr style="margin:24px 0;border:0;border-top:1px solid ${COLORS.border}">` +
    blockHtml('en', en, enFooter) +
    '</div></body></html>';

  return { subject: fullSubject, text, html };
}
