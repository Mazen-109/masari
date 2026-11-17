import { renderEmail, type RenderedEmail } from './layout';

/** Sent instead of a confirmation when the address already has an account (contracts/emails.md §3). */
export function accountExists({
  signInUrl,
  resetUrl,
}: {
  signInUrl: string;
  resetUrl: string;
}): RenderedEmail {
  return renderEmail({
    subject: {
      ar: 'لديك حساب بالفعل في مساري',
      en: 'You already have a Masari account',
    },
    ar: {
      paragraphs: [
        'حاول شخص إنشاء حساب في مساري بهذا البريد الإلكتروني، لكن لديك حساب بالفعل.',
        'يمكنك تسجيل الدخول، أو إعادة تعيين كلمة المرور إذا نسيتها.',
      ],
      links: [
        { label: 'تسجيل الدخول', url: signInUrl },
        { label: 'إعادة تعيين كلمة المرور', url: resetUrl },
      ],
      notes: ['إذا لم تكن أنت من حاول التسجيل فلا داعي لأي إجراء؛ حسابك لم يتغير.'],
    },
    en: {
      paragraphs: [
        'Someone tried to register for Masari with this email address, but you already have an account.',
        'You can sign in, or reset your password if you have forgotten it.',
      ],
      links: [
        { label: 'Sign in', url: signInUrl },
        { label: 'Reset password', url: resetUrl },
      ],
      notes: ['If this was not you, no action is needed; your account has not changed.'],
    },
  });
}
