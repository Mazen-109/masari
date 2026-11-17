import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/forms/submit-button';
import { signOutAction } from '@/features/auth/actions';

/**
 * "Sign out" (FR-008): a form posting to `signOutAction`, so it also works without JavaScript. A form,
 * not a link: signing out changes state and must not be triggered by a prefetch or a crawler.
 */
export function SignOutButton({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('auth.signOut');

  return (
    <form action={signOutAction}>
      <SubmitButton variant="outline" className={className}>
        {t('submit')}
      </SubmitButton>
    </form>
  );
}
