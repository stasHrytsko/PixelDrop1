export type DifficultyBand = 'easy' | 'medium' | 'hard';

export const BAND_LABEL: Record<DifficultyBand, string> = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Сложно',
};

/**
 * Split the level list into three equal bands.
 *
 * With the standard levelCount of 9 this is exactly the 3x3 grid: rows 1-3
 * easy, 4-6 medium, 7-9 hard. It keeps working for other counts instead of
 * hard-coding the number nine in the UI.
 */
export function difficultyBand(levelIndex: number, levelCount: number): DifficultyBand {
  const third = levelCount / 3;
  if (levelIndex < third) return 'easy';
  if (levelIndex < third * 2) return 'medium';
  return 'hard';
}
