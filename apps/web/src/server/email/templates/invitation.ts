import type { Role } from '@masari/db';
import ar from '../../../../messages/ar.json';
import en from '../../../../messages/en.json';
import { plainValue, renderEmail, type RenderedEmail } from './layout';

/**
 * Invitation to join a college (contracts/emails.md §3). Role labels come from the message catalogs
 * (`common.roles`, contracts/permissions.md §1), so the email and the screens never disagree.
 */
export function invitation(input: {
  collegeNameAr: string;
  collegeNameEn: string;
  role: Role;
  url: string;
}): RenderedEmail {
  const collegeNameAr = plainValue(input.collegeNameAr);
  const collegeNameEn = plainValue(input.collegeNameEn);
  const { role, url } = input;
  return renderEmail({
    subject: {
      ar: `دعوة للانضمام إلى ${collegeNameAr} على مساري`,
      en: `Invitation to join ${collegeNameEn} on Masari`,
    },
    ar: {
      paragraphs: [
        `دعتك ${collegeNameAr} للانضمام إلى مساري بدور «${ar.common.roles[role]}».`,
        'اضغط الزر لقبول الدعوة وإنشاء حسابك.',
      ],
      links: [{ label: 'قبول الدعوة', url }],
      notes: ['الدعوة صالحة لمدة 7 أيام.'],
    },
    en: {
      paragraphs: [
        `${collegeNameEn} has invited you to join Masari as “${en.common.roles[role]}”.`,
        'Use the button to accept the invitation and create your account.',
      ],
      links: [{ label: 'Accept invitation', url }],
      notes: ['This invitation is valid for 7 days.'],
    },
    collegeName: { ar: collegeNameAr, en: collegeNameEn },
  });
}
