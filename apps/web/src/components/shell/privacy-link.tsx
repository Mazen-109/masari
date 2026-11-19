'use client';

import { usePathname } from 'next/navigation';
import { localeLessPath } from '@/lib/locale';

/**
 * Footer link to the privacy notice (FR-011); marked as the current page on `/privacy`. The server layout
 * gives the translated label and the localized address. A plain anchor: this footer is on every public
 * screen, and `next/link` would add its own copy to this script (PR-40); the notice is a static page.
 */
export function PrivacyLink({
  href,
  label,
  className,
}: Readonly<{ href: string; label: string; className?: string }>) {
  const current = localeLessPath(usePathname()) === '/privacy';

  return (
    <a href={href} aria-current={current ? 'page' : undefined} className={className}>
      {label}
    </a>
  );
}
