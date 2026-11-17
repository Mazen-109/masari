/**
 * Message keys (`common` namespace) of the level names «الفرقة الأولى … السابعة» / "Level 1 … 7"
 * (contracts/routes.md §6), so a level number is turned into a typed key in one place.
 */
const LEVEL_LABEL_KEYS = [
  'levels.1',
  'levels.2',
  'levels.3',
  'levels.4',
  'levels.5',
  'levels.6',
  'levels.7',
] as const;

export type LevelLabelKey = (typeof LEVEL_LABEL_KEYS)[number];

/** The `common` key naming the level; throws for anything but a whole number 1–7. */
export function levelLabelKey(level: number): LevelLabelKey {
  const key = Number.isInteger(level) ? LEVEL_LABEL_KEYS[level - 1] : undefined;
  if (key === undefined) throw new RangeError('level must be a whole number from 1 to 7');
  return key;
}
