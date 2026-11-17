/**
 * True when the locale-less `pathname` is the navigation entry `href` or a screen below it, so the entry
 * gets `aria-current="page"` (contracts/routes.md §4). `/modules/mueed` is not current on
 * `/modules/mueedx`; a trailing slash on the pathname is ignored.
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return path === href || path.startsWith(`${href}/`);
}
