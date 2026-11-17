import type { ModuleKey } from '@masari/db';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NavIcon } from '@/components/shell/nav-icon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { MODULE_REGISTRY } from '@/modules/registry';

/**
 * A module on the home screen (contracts/routes.md §4; FR-035, FR-040): icon, name (a link to the module
 * screen), one-sentence description, and the "coming soon" badge. The whole card is clickable through the
 * title link's stretched area; only the title link is focusable. The arrow mirrors in Arabic.
 */
export function ModuleCard({ moduleKey }: Readonly<{ moduleKey: ModuleKey }>) {
  const t = useTranslations('modules');
  const tDashboard = useTranslations('dashboard');

  return (
    <Card
      data-module={moduleKey}
      className="relative h-full gap-3 focus-within:border-primary hover:border-primary"
    >
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
            <NavIcon name={MODULE_REGISTRY[moduleKey].icon} className="size-6" />
          </span>
          <Badge>{tDashboard('comingSoon')}</Badge>
        </div>
        <CardTitle>
          <h2>
            <Link
              href={`/modules/${moduleKey}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-md text-primary after:absolute after:inset-0 after:rounded-lg"
            >
              {t(`${moduleKey}.name`)}
              <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
            </Link>
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>
          <p>{t(`${moduleKey}.description`)}</p>
        </CardDescription>
      </CardContent>
    </Card>
  );
}
