'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ScrollableTableProps = Omit<ComponentProps<typeof Table>, 'containerProps'> & {
  /** Id of the heading that names the table's region. */
  labelledBy: string;
  /** Id given to the hint paragraph. */
  hintId: string;
  /** "The table is wider than the screen…", already translated. */
  hint: string;
};

/**
 * A table inside a focusable region named by `labelledBy`, which scrolls sideways when the table is wider
 * than the screen (keyboard: focus the region, then the arrow keys). The hint is shown, and becomes the
 * region's description (`aria-describedby`), only while the table actually overflows, as measured in the
 * browser (ResizeObserver also reports the first size). Before that measurement — and without
 * JavaScript — the hint shows on narrow screens only and describes nothing.
 */
export function ScrollableTable({
  labelledBy,
  hintId,
  hint,
  children,
  ...tableProps
}: ScrollableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState<boolean | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const observer = new ResizeObserver(() => {
      setOverflows(container.scrollWidth - container.clientWidth > 1);
    });
    observer.observe(container);
    // The table grows or shrinks with its rows (e.g. after a refresh) without the container resizing.
    if (container.firstElementChild !== null) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p
        id={hintId}
        data-slot="scroll-hint"
        className={cn(
          'text-sm text-muted-foreground',
          overflows === null && 'sm:hidden',
          overflows === false && 'hidden',
        )}
      >
        {hint}
      </p>
      <Table
        {...tableProps}
        containerProps={{
          ref: containerRef,
          role: 'region',
          'aria-labelledby': labelledBy,
          'aria-describedby': overflows === true ? hintId : undefined,
          tabIndex: 0,
        }}
      >
        {children}
      </Table>
    </div>
  );
}
