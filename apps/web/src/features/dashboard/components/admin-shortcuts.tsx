import type { Role } from '@masari/db';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavIcon } from '@/components/shell/nav-icon';
import { ADMIN_NAV_ENTRIES } from '@/components/shell/nav-items';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { can } from '@/server/auth/permissions';

/**
 * The administration shortcuts of the home screen (contracts/routes.md §4, FR-040): one card per admin
 * screen the role may open, from the same entries and permissions as the navigation, so the two never
 * disagree. Renders nothing for a role without any. Same card pattern as the module cards: the title link's
 * stretched area makes the card clickable, and only the link is focusable. The arrow mirrors in Arabic.
 */
export function AdminShortcuts({ role }: Readonly<{ role: Role }>) {
  const t = useTranslations('dashboard.adminShortcuts');
  const tNav = useTranslations('nav');
  const entries = ADMIN_NAV_ENTRIES.filter((entry) => can(role, entry.permission));
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="admin-shortcuts-title" className="flex flex-col gap-4">
      <h2 id="admin-shortcuts-title" className="text-xl font-semibold">
        {tNav('adminSection')}
      </h2>
      <ul
        aria-label={t('label')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        data-slot="admin-shortcuts"
      >
        {entries.map((entry) => (
          <li key={entry.key}>
            <Card
              data-shortcut={entry.key}
              className="relative h-full gap-3 focus-within:border-primary hover:border-primary"
            >
              <CardHeader className="gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                  <NavIcon name={entry.icon} className="size-6" />
                </span>
                <CardTitle>
                  <h3>
                    <Link
                      href={entry.href}
                      // Stand-alone title link: underlined only on hover and keyboard focus.
                      className="inline-flex min-h-11 items-center gap-1 rounded-md text-primary no-underline after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:underline"
                    >
                      {tNav(`admin.${entry.key}`)}
                      <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                    </Link>
                  </h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  <p>{t(entry.key)}</p>
                </CardDescription>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
