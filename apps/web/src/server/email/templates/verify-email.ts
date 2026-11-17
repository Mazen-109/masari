import { plainValue, renderEmail, type RenderedEmail } from './layout';

/** Confirmation link after registration or a resend request (contracts/emails.md §3). */
export function verifyEmail(input: { name: string; url: string }): RenderedEmail {
  const name = plainValue(input.name);
  const { url } = input;
  return renderEmail({
    subject: {
      ar: 'تأكيد بريدك الإلكتروني في مساري',
      en: 'Confirm your email for Masari',
    },
    ar: {
      paragraphs: [
        `مرحبًا ${name}،`,
        'شكرًا لإنشاء حسابك في مساري. أكّد بريدك الإلكتروني لتفعيل الحساب.',
      ],
      links: [{ label: 'تأكيد البريد الإلكتروني', url }],
      notes: ['الرابط صالح لمدة 24 ساعة.'],
    },
    en: {
      paragraphs: [
        `Hello ${name},`,
        'Thank you for creating your Masari account. Confirm your email to activate it.',
      ],
      links: [{ label: 'Confirm email', url }],
      notes: ['This link is valid for 24 hours.'],
    },
  });
}
