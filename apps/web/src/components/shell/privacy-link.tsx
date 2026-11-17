'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Footer link to the privacy notice (FR-011); marked as the current page on `/privacy`. */
export function PrivacyLink({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('common');
  const current = usePathname() === '/privacy';

  return (
    <Link href="/privacy" aria-current={current ? 'page' : undefined} className={className}>
      {t('privacyNotice')}
    </Link>
  );
}
