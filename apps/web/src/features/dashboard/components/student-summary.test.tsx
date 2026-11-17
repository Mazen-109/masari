import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ar from '../../../../messages/ar.json';
import en from '../../../../messages/en.json';
import { StudentSummary } from './student-summary';

function render(node: ReactNode, locale: 'ar' | 'en' = 'en'): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'ar' ? ar : en}
      timeZone="Africa/Cairo"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** The inner HTML of the `<dd>` with this data-field. */
function entry(html: string, field: string): string {
  return new RegExp(`<dd[^>]*data-field="${field}"[^>]*>(.*?)</dd>`).exec(html)?.[1] ?? '';
}

const FALLBACK = en.dashboard.studentSummary.divisionUnavailable;

describe('StudentSummary', () => {
  it('shows the code (isolated with dir="ltr"), the level, and an active division', () => {
    const html = render(
      <StudentSummary
        studentCode="CS-2024-001"
        levelLabel="Level 3"
        division={{ name: 'Computer Science', active: true }}
      />,
    );
    expect(entry(html, 'studentCode')).toBe('<bdi dir="ltr">CS-2024-001</bdi>');
    expect(entry(html, 'level')).toBe('Level 3');
    expect(entry(html, 'division')).toBe('Computer Science');
    expect(html).not.toContain(FALLBACK);
  });

  it('keeps the name of a deactivated division and adds the note', () => {
    const html = render(
      <StudentSummary
        studentCode="CS-2024-001"
        levelLabel="Level 3"
        division={{ name: 'Computer Science', active: false }}
      />,
    );
    const division = entry(html, 'division');
    expect(division).toContain('Computer Science');
    expect(division).toContain(FALLBACK);
  });

  it('shows the note instead of an empty entry when the division cannot be read', () => {
    const html = render(
      <StudentSummary studentCode="CS-2024-001" levelLabel="الفرقة الثالثة" division={null} />,
      'ar',
    );
    expect(entry(html, 'division')).toContain(ar.dashboard.studentSummary.divisionUnavailable);
  });
});
