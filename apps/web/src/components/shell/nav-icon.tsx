import {
  BookOpen,
  Briefcase,
  CircleHelp,
  CodeXml,
  Compass,
  House,
  Layers,
  MailPlus,
  MessagesSquare,
  Scale,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The lucide icons named by the module registry and the navigation entries (contracts/permissions.md §4).
 * Rendered on the server: client components receive the rendered element, so only icons used directly by
 * client components reach the browser bundle. Icons are decorative (`aria-hidden`); the entry's text names it.
 */
export const NAV_ICONS: Readonly<Record<string, LucideIcon>> = {
  House,
  MessagesSquare,
  CodeXml,
  Scale,
  BookOpen,
  Compass,
  Briefcase,
  Users,
  MailPlus,
  Layers,
  Settings,
};

export function NavIcon({ name, className }: Readonly<{ name: string; className?: string }>) {
  const Icon = NAV_ICONS[name] ?? CircleHelp;
  return <Icon aria-hidden="true" focusable="false" className={className ?? 'size-5'} />;
}
