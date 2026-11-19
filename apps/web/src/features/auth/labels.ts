import { getTranslations } from 'next-intl/server';

/**
 * Texts of the sign-in and "send the confirmation email again" forms, translated by the (server) page
 * and passed as props, so these forms load no next-intl client code (PR-40, FR-043).
 */
export type SignInLabels = Readonly<{ email: string; password: string; submit: string }>;

export type ResendLabels = Readonly<{
  title: string;
  lead: string;
  email: string;
  submit: string;
  sent: string;
}>;

/** `missing`: the email may not have arrived ("check your email"). `invalid`: the link did not work. */
export async function getResendLabels(variant: 'missing' | 'invalid'): Promise<ResendLabels> {
  const t = await getTranslations('auth.resend');
  return {
    title: variant === 'missing' ? t('titleMissing') : t('titleInvalid'),
    lead: t('lead'),
    email: t('email'),
    submit: t('submit'),
    sent: t('sent'),
  };
}

export async function getSignInLabels(): Promise<SignInLabels> {
  const t = await getTranslations('auth.signIn');
  return { email: t('email'), password: t('password'), submit: t('submit') };
}
