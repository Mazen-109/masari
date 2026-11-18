import { useLocale, useTranslations } from 'next-intl';
import { ScrollableTable } from '@/components/scrollable-table';
import { Badge } from '@/components/ui/badge';
import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { DivisionStatusForm } from './division-status-form';
import { EditDivisionDialog } from './edit-division-dialog';

/** What one row shows — nothing more reaches the page than the screen needs. */
export type DivisionRow = Readonly<{
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}>;

/** Dense cells (DESIGN.md "Tables"), as on the People screen, so the row actions fit beside the names. */
const CELL = 'px-3';
const WRAP = 'px-3 whitespace-normal wrap-break-word';
const HEAD = 'px-3 whitespace-normal';

/**
 * Every division of the college, inactive ones too, in display order (FR-033, contracts/routes.md §4):
 * code (`dir="ltr"`), Arabic and English names (each in its own direction), order (Western digits), a
 * status badge with its word, and the row actions — edit, and deactivate or reactivate. There is no delete.
 * A captioned table with column headers inside a focusable region labelled by `labelledBy`; when it is
 * wider than the screen it scrolls sideways and a hint says so (ScrollableTable). The caller renders the
 * empty state.
 */
export function DivisionsTable({
  rows,
  labelledBy,
}: Readonly<{ rows: readonly DivisionRow[]; labelledBy: string }>) {
  const t = useTranslations('admin.divisions.list');
  const locale = useLocale();

  return (
    <ScrollableTable
      data-slot="divisions-table"
      labelledBy={labelledBy}
      hintId={`${labelledBy}-scroll-hint`}
      hint={t('scrollHint')}
    >
      <TableCaption className="sr-only">{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={HEAD}>
            {t('code')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('nameAr')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('nameEn')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('sortOrder')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('status')}
          </TableHead>
          <TableHead scope="col" className={HEAD}>
            {t('actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            data-division={row.id}
            data-code={row.code}
            data-status={row.isActive ? 'active' : 'inactive'}
          >
            <TableCell data-field="code" className={CELL}>
              <bdi dir="ltr">{row.code}</bdi>
            </TableCell>
            <TableCell data-field="nameAr" className={WRAP}>
              <bdi dir="rtl" lang="ar">
                {row.nameAr}
              </bdi>
            </TableCell>
            <TableCell data-field="nameEn" className={WRAP}>
              <bdi dir="ltr" lang="en">
                {row.nameEn}
              </bdi>
            </TableCell>
            <TableCell data-field="sortOrder" className={`${CELL} tabular-nums`}>
              {formatNumber(row.sortOrder, locale)}
            </TableCell>
            <TableCell data-field="status" className={CELL}>
              <Badge variant={row.isActive ? 'success' : 'neutral'}>
                {row.isActive ? t('active') : t('inactive')}
              </Badge>
            </TableCell>
            <TableCell data-field="actions" className={CELL}>
              {/* Side by side when the column has room, one under the other when it does not. */}
              <div className="flex flex-wrap items-start gap-2">
                <EditDivisionDialog division={row} />
                <DivisionStatusForm divisionId={row.id} code={row.code} isActive={row.isActive} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}
