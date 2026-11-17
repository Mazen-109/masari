import { MODULE_KEYS, type ModuleKey } from '@masari/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NavIcon } from '@/components/shell/nav-icon';
import { Badge } from '@/components/ui/badge';
import { routing } from '@/i18n/routing';
import { MODULE_REGISTRY, visibleModules } from '@/modules/registry';
import { getSessionContext, requireSession, type SessionContext } from '@/server/auth/session';

type Props = Readonly<{ params: Promise<{ locale: string; moduleKey: string }> }>;

function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/** A known module the user's role may use and the college has enabled. */
function isVisible(moduleKey: string, ctx: SessionContext): moduleKey is ModuleKey {
  return (
    isModuleKey(moduleKey) &&
    visibleModules(ctx.user.role, ctx.tenant.enabledModules).includes(moduleKey)
  );
}

/**
 * The title names the module only when the page will show it. Otherwise `notFound()` is thrown here as
 * well: Next.js then takes the title from `(app)/not-found.tsx` (a page's own later `notFound()` does not
 * replace metadata already resolved), and the title never reveals a module the user may not open.
 * Without a session the page redirects to sign-in, so no title is needed.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, moduleKey } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const ctx = await getSessionContext();
  if (ctx === null) return {};
  if (!isVisible(moduleKey, ctx)) notFound();
  const t = await getTranslations({ locale, namespace: 'modules' });
  return { title: t(`${moduleKey}.name`) };
}

/**
 * Placeholder screen of a module (contracts/routes.md §4; FR-035): its name, description, and "coming
 * soon". A module the role may not use, one the college disabled, and an unknown key all answer the
 * localized 404 inside the shell (`(app)/not-found.tsx`), never a hint that the module exists.
 */
export default async function ModulePage({ params }: Props) {
  const { locale, moduleKey } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await connection();
  const ctx = await requireSession(`/modules/${encodeURIComponent(moduleKey)}`);
  if (!isVisible(moduleKey, ctx)) notFound();
  const t = await getTranslations('modules');
  const tDashboard = await getTranslations('dashboard');

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <span className="inline-flex size-12 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
        <NavIcon name={MODULE_REGISTRY[moduleKey].icon} className="size-7" />
      </span>
      <h1 className="text-3xl font-bold text-balance">{t(`${moduleKey}.name`)}</h1>
      <p className="text-lg">{t(`${moduleKey}.description`)}</p>
      <Badge>{tDashboard('comingSoon')}</Badge>
      <p className="text-muted-foreground">{t('comingSoonBody')}</p>
    </div>
  );
}
