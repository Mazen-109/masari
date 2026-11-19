import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { AcceptInvitationForm } from '@/features/auth/components/accept-invitation-form';
import { ClientMessages } from '@/i18n/client-messages';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { findUsableInvitation } from '@/server/auth/invitation-lookup';

type Props = Readonly<{ params: Promise<{ locale: string; token: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  // The address holds the invitation token: never send it to another site as a referrer.
  // Stated here as well as in the layout: a page whose address holds a token is never indexed.
  return {
    title: t('invite'),
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  };
}

/**
 * Where an invitation link lands (contracts/routes.md §2; FR-020, FR-021). A usable invitation shows the
 * college's name in the current language, the invited role, and the form. Every other case — expired,
 * revoked, used, unknown, malformed, or a suspended college — shows the same "no longer valid" screen, so
 * the page never tells them apart. The email address of the invitation is not shown.
 */
export default async function InvitePage({ params }: Props) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Rendered per request (the invitation's state); never prerendered at build time.
  await connection();
  const t = await getTranslations('auth.invite');
  const tRoles = await getTranslations('common.roles');
  const found = await findUsableInvitation(token);

  if (found === null) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold text-balance">{t('invalidTitle')}</h1>
        <p className="mt-4 text-lg">{t('invalidBody')}</p>
        <Link href="/sign-in" className={buttonVariants({ className: 'mt-8' })}>
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const { invitation, tenant } = found;
  const college = locale === 'ar' ? tenant.nameAr : tenant.nameEn;

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold text-balance">{t('title', { college })}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('lead')}</p>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4">
        <dt className="text-muted-foreground">{t('college')}</dt>
        <dd className="font-medium" data-slot="invite-college">
          {college}
        </dd>
        <dt className="text-muted-foreground">{t('role')}</dt>
        <dd className="font-medium" data-slot="invite-role">
          {tRoles(invitation.role)}
        </dd>
      </dl>
      <div className="mt-8">
        <ClientMessages forms namespaces={['auth.invite', 'common.opensInNewTab']}>
          <AcceptInvitationForm token={token} />
        </ClientMessages>
      </div>
    </div>
  );
}
