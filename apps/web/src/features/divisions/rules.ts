/** Pure rules of the divisions screen (FR-033; data-model.md §3.5). */

/** What the edit form may change: the names and the display order (the code never changes). */
export type DivisionEditable = Readonly<{ nameAr: string; nameEn: string; sortOrder: number }>;

export type DivisionField = keyof DivisionEditable;

/** Display and audit order of the editable fields. */
export const DIVISION_FIELDS = [
  'nameAr',
  'nameEn',
  'sortOrder',
] as const satisfies readonly DivisionField[];

/** Only the fields whose value differs between `before` and `after`, in DIVISION_FIELDS order. */
export function changedDivisionFields(
  before: DivisionEditable,
  after: DivisionEditable,
): Partial<DivisionEditable> {
  const patch: { nameAr?: string; nameEn?: string; sortOrder?: number } = {};
  if (before.nameAr !== after.nameAr) patch.nameAr = after.nameAr;
  if (before.nameEn !== after.nameEn) patch.nameEn = after.nameEn;
  if (before.sortOrder !== after.sortOrder) patch.sortOrder = after.sortOrder;
  return patch;
}
