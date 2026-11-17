'use client';

import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { isCurrentPath } from '@/lib/is-current-path';
import { cn } from '@/lib/utils';

/** A navigation entry as rendered by the server: translated label, rendered icon (nav-items.ts). */
export type RenderedNavItem = { id: string; href: string; label: string; icon: ReactNode };
export type RenderedNavSection = { id: string; heading?: string; items: RenderedNavItem[] };

/**
 * The entries of the signed-in navigation (contracts/routes.md §4), shared by the sidebar and the drawer.
 * The current entry has `aria-current="page"` and the selected-row colours. `onNavigate` lets the drawer
 * close when an entry is chosen.
 */
export function NavList({
  sections,
  idPrefix,
  onNavigate,
}: Readonly<{ sections: RenderedNavSection[]; idPrefix: string; onNavigate?: () => void }>) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => {
        const headingId = `${idPrefix}-${section.id}`;
        return (
          <div key={section.id} className="flex flex-col gap-1">
            {section.heading === undefined ? null : (
              <p id={headingId} className="px-3 text-sm font-medium text-muted-foreground">
                {section.heading}
              </p>
            )}
            <ul
              className="flex flex-col gap-1"
              aria-labelledby={section.heading === undefined ? undefined : headingId}
            >
              {section.items.map((item) => {
                const current = isCurrentPath(pathname, item.href);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      data-nav={item.id}
                      aria-current={current ? 'page' : undefined}
                      onClick={onNavigate}
                      className={cn(
                        // Stand-alone navigation rows: no underline (DESIGN.md "Underlined-Link
                        // Rule"); hover fill, selected colours, and the focus ring mark them.
                        'flex min-h-11 items-center gap-3 rounded-md px-3 font-medium no-underline',
                        current
                          ? 'bg-primary-soft text-primary-soft-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {item.icon}
                      <span className="min-w-0">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
