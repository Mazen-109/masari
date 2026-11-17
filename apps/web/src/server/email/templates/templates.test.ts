import { ROLES } from '@masari/db';
import { describe, expect, it } from 'vitest';
import ar from '../../../../messages/ar.json';
import en from '../../../../messages/en.json';
import type { EmailTemplateName } from '../send';
import { accountExists } from './account-exists';
import { invitation } from './invitation';
import { invitationPending } from './invitation-pending';
import { TEXT_DIVIDER, type RenderedEmail } from './layout';
import { resetPassword } from './reset-password';
import { verifyEmail } from './verify-email';

// The four checks of contracts/emails.md §2, applied to every template of §3.

const ATTACK = '<script>alert(1)</script>';
const URL_A = 'https://masari.test/api/auth/verify-email?token=t0k&callbackURL=/ar/email-verified';
const URL_B = 'https://masari.test/ar/forgot-password';

const ARABIC = /[؀-ۿ]/;

type Case = {
  template: EmailTemplateName;
  /** Rendered with ordinary inputs. */
  render: () => RenderedEmail;
  /** Rendered with `<script>` in every free-text input. */
  renderAttack: () => RenderedEmail;
  urls: readonly string[];
  subject: string;
};

const CASES: readonly Case[] = [
  {
    template: 'verify-email',
    render: () => verifyEmail({ name: 'Mona', url: URL_A }),
    renderAttack: () => verifyEmail({ name: ATTACK, url: URL_A }),
    urls: [URL_A],
    subject: 'تأكيد بريدك الإلكتروني في مساري | Confirm your email for Masari',
  },
  {
    template: 'account-exists',
    render: () => accountExists({ signInUrl: URL_A, resetUrl: URL_B }),
    renderAttack: () => accountExists({ signInUrl: `${URL_A}${ATTACK}`, resetUrl: URL_B }),
    urls: [URL_A, URL_B],
    subject: 'لديك حساب بالفعل في مساري | You already have a Masari account',
  },
  {
    template: 'invitation-pending',
    render: () => invitationPending({ collegeNameAr: 'كلية الحاسبات', collegeNameEn: 'Computing' }),
    renderAttack: () => invitationPending({ collegeNameAr: ATTACK, collegeNameEn: ATTACK }),
    urls: [],
    subject: 'لديك دعوة للانضمام إلى مساري | You have an invitation to join Masari',
  },
  {
    template: 'reset-password',
    render: () => resetPassword({ name: 'Mona', url: URL_A }),
    renderAttack: () => resetPassword({ name: ATTACK, url: URL_A }),
    urls: [URL_A],
    subject: 'إعادة تعيين كلمة المرور في مساري | Reset your Masari password',
  },
  {
    template: 'invitation',
    render: () =>
      invitation({
        collegeNameAr: 'كلية الحاسبات',
        collegeNameEn: 'Computing',
        role: 'faculty',
        url: URL_A,
      }),
    renderAttack: () =>
      invitation({ collegeNameAr: ATTACK, collegeNameEn: ATTACK, role: 'admin', url: URL_A }),
    urls: [URL_A],
    subject: 'دعوة للانضمام إلى كلية الحاسبات على مساري | Invitation to join Computing on Masari',
  },
];

describe.each(CASES)('$template', ({ render, renderAttack, urls, subject }) => {
  it('is bilingual with Arabic first, in html and in text', () => {
    const email = render();
    const arStart = email.html.indexOf('<div dir="rtl" lang="ar"');
    const enStart = email.html.indexOf('<div dir="ltr" lang="en"');
    expect(arStart).toBeGreaterThan(-1);
    expect(enStart).toBeGreaterThan(arStart);

    const [arText, enText, ...rest] = email.text.split(TEXT_DIVIDER);
    expect(rest).toEqual([]);
    expect(arText).toMatch(ARABIC);
    expect(enText).toMatch(/[A-Za-z]/);
    expect(enText).not.toMatch(ARABIC);
  });

  it('shows every link in text (own line) and in html (button and visible text)', () => {
    const email = render();
    const textLines = email.text.split('\n');
    for (const url of urls) {
      const escaped = url.replaceAll('&', '&amp;');
      expect(textLines.filter((line) => line === url)).toHaveLength(2);
      expect(email.html.split(`href="${escaped}"`)).toHaveLength(5);
      expect(email.html).toContain(`>${escaped}</a>`);
    }
    if (urls.length === 0) {
      // invitation-pending: the token cannot be recovered, so the email links nowhere.
      expect(email.text).not.toMatch(/https?:/);
      expect(email.html).not.toMatch(/https?:|href=/);
    }
  });

  it('escapes <script> in every input', () => {
    const { html, text } = renderAttack();
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    // The plain-text part is not HTML; the value appears as typed.
    expect(text).toContain(urls.length === 2 ? `${URL_A}${ATTACK}` : ATTACK);
  });

  it('has the subject "<Arabic> | <English>"', () => {
    const email = render();
    expect(email.subject).toBe(subject);
    const [subjectAr, subjectEn, ...rest] = email.subject.split(' | ');
    expect(rest).toEqual([]);
    expect(subjectAr).toMatch(ARABIC);
    expect(subjectEn).not.toMatch(ARABIC);
  });
});

describe('invitation', () => {
  it.each(ROLES)('names the role %s with the catalog labels in both languages', (role) => {
    const { text } = invitation({ collegeNameAr: 'ك', collegeNameEn: 'C', role, url: URL_A });
    const labels = [`«${ar.common.roles[role]}»`, `“${en.common.roles[role]}”`];
    for (const label of labels) expect(text).toContain(label);
  });

  it('names the college in the footer of each language', () => {
    const { text } = invitation({
      collegeNameAr: 'كلية الحاسبات',
      collegeNameEn: 'Computing',
      role: 'student',
      url: URL_A,
    });
    const [arText, enText] = text.split(TEXT_DIVIDER);
    expect(arText).toContain('نيابةً عن كلية الحاسبات');
    expect(enText).toContain('on behalf of Computing');
  });
});
