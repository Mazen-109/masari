import { useTranslations } from 'next-intl';
import { NavList, type RenderedNavSection } from './nav-list';

/**
 * Navigation sidebar of the signed-in shell (contracts/routes.md §4) from 1024 px; below that the same
 * entries live in the drawer (mobile-nav.tsx). Without JavaScript the drawer cannot open, so the sidebar
 * is then shown at every width (above the content on narrow screens).
 */
export function AppSidebar({ sections }: Readonly<{ sections: RenderedNavSection[] }>) {
  const t = useTranslations('nav');

  return (
    <nav
      aria-label={t('label')}
      data-slot="app-sidebar"
      className="hidden shrink-0 border-b border-border px-4 py-4 sm:px-6 lg:block lg:w-64 lg:border-e lg:border-b-0 lg:py-12 lg:ps-0 lg:pe-4 noscript:block"
    >
      <NavList sections={sections} idPrefix="sidebar" />
    </nav>
  );
}
