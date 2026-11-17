import { renderEmail, type RenderedEmail } from './layout';

/** Password-reset link (contracts/emails.md §3). */
export function resetPassword({ name, url }: { name: string; url: string }): RenderedEmail {
  return renderEmail({
    subject: {
      ar: 'إعادة تعيين كلمة المرور في مساري',
      en: 'Reset your Masari password',
    },
    ar: {
      paragraphs: [`مرحبًا ${name}،`, 'وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في مساري.'],
      links: [{ label: 'إعادة تعيين كلمة المرور', url }],
      notes: [
        'الرابط صالح لمدة ساعة واحدة.',
        'إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة؛ كلمة المرور الحالية لن تتغير.',
      ],
    },
    en: {
      paragraphs: [
        `Hello ${name},`,
        'We received a request to reset the password of your Masari account.',
      ],
      links: [{ label: 'Reset password', url }],
      notes: [
        'This link is valid for 1 hour.',
        'If you did not ask for a reset, ignore this email; your current password will not change.',
      ],
    },
  });
}
