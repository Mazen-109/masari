import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { usersQueryString, type UsersFilterParams } from '../schemas';

/**
 * Previous / next links and "page x of y" under the People table (FR-029). The links keep the filters in
 * effect; a link that leads nowhere (before the first page, after the last) is not rendered. Arrows point
 * along the reading direction (mirrored in Arabic). Nothing is rendered when everything fits on one page.
 */
export function UsersPagination({
  filter,
  page,
  pages,
}: Readonly<{ filter: Omit<UsersFilterParams, 'page'>; page: number; pages: number }>) {
  const t = useTranslations('admin.users.pagination');
  const locale = useLocale();
  if (pages <= 1) return null;
  const href = (target: number) => `/admin/users${usersQueryString(filter, target)}`;

  return (
    <nav
      aria-label={t('label')}
      data-slot="users-pagination"
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <div className="min-w-36">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={href(page - 1)} rel="prev" data-slot="users-previous">
              <ChevronLeft aria-hidden="true" className="rtl:-scale-x-100" />
              {t('previous')}
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground tabular-nums" data-slot="users-page-status">
        {t('status', {
          page: formatNumber(page, locale),
          pages: formatNumber(pages, locale),
        })}
      </p>
      <div className="flex min-w-36 justify-end">
        {page < pages ? (
          <Button asChild variant="outline">
            <Link href={href(page + 1)} rel="next" data-slot="users-next">
              {t('next')}
              <ChevronRight aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
