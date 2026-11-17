import { getTranslations } from 'next-intl/server';
import type { SessionContext } from '@/server/auth/session';
import { NavIcon } from './nav-icon';
import { buildNavItems, type NavItem } from './nav-items';
import type { RenderedNavItem, RenderedNavSection } from './nav-list';

/**
 * The navigation of the signed-in shell, translated and with rendered icons, ready for the client
 * `NavList` (sidebar and drawer). The "Administration" section is left out when it has no entries.
 */
export async function getNavSections(ctx: SessionContext): Promise<RenderedNavSection[]> {
  const t = await getTranslations();
  const { main, admin } = buildNavItems(ctx);
  const render = (item: NavItem): RenderedNavItem => ({
    id: item.id,
    href: item.href,
    label: t(item.label),
    icon: <NavIcon name={item.icon} />,
  });

  const sections: RenderedNavSection[] = [{ id: 'main', items: main.map(render) }];
  if (admin.length > 0) {
    sections.push({ id: 'admin', heading: t('nav.adminSection'), items: admin.map(render) });
  }
  return sections;
}
