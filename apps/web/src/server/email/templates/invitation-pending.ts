import { plainValue, renderEmail, type RenderedEmail } from './layout';

/**
 * Sent when someone registers with an address that has a pending invitation (contracts/emails.md §3).
 * It contains no link: the invitation token is stored only as a hash and cannot be recovered.
 */
export function invitationPending(input: {
  collegeNameAr: string;
  collegeNameEn: string;
}): RenderedEmail {
  const collegeNameAr = plainValue(input.collegeNameAr);
  const collegeNameEn = plainValue(input.collegeNameEn);
  return renderEmail({
    subject: {
      ar: 'لديك دعوة للانضمام إلى مساري',
      en: 'You have an invitation to join Masari',
    },
    ar: {
      paragraphs: [
        `لديك بالفعل دعوة من ${collegeNameAr} للانضمام إلى مساري، لذلك لم يُنشأ حساب جديد.`,
        'استخدم الرابط الموجود في رسالة الدعوة، أو اطلب من إدارة الكلية إرسال دعوة جديدة.',
      ],
    },
    en: {
      paragraphs: [
        `You already have an invitation from ${collegeNameEn} to join Masari, so no new account was created.`,
        'Use the link in the invitation email, or ask the college administration to send a new invitation.',
      ],
    },
    collegeName: { ar: collegeNameAr, en: collegeNameEn },
  });
}
