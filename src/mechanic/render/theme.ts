import type { ColorId } from '../engine/types.ts';

/**
 * Bridge between the CSS design tokens and the Phaser scene.
 *
 * The DOM shell and the Phaser canvas have to look like the same application,
 * and they render through completely different stacks. Every colour a scene
 * uses is read from here at runtime (see src/styles/tokens.css) so the two
 * halves cannot drift apart.
 */
export interface SceneTheme {
  background: number;
  cellEmpty: number;
  cellBorder: number;
  /** Drop feedback: a valid placement preview / a successful drop. */
  ok: number;
  /** Drop feedback: an invalid placement preview / a rejected drop. */
  error: number;
  colors: Readonly<Record<ColorId, number>>;
}

const FALLBACK: SceneTheme = {
  background: 0x171a21,
  cellEmpty: 0x171a21,
  cellBorder: 0x2a3039,
  ok: 0x34d399,
  error: 0xf87171,
  colors: {
    red: 0xef4444,
    blue: 0x3b82f6,
    green: 0x22c55e,
    yellow: 0xeab308,
    purple: 0xa855f7,
    orange: 0xf97316,
    pink: 0xf472b6,
  },
};

function hexToNumber(value: string, fallback: number): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return fallback;
  return Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const styles = getComputedStyle(root);
  const token = (name: string): string => styles.getPropertyValue(name);
  const color = (name: string, fallback: number): number => hexToNumber(token(name), fallback);

  return {
    background: color('--surface', FALLBACK.background),
    cellEmpty: color('--pixel-cell-empty', FALLBACK.cellEmpty),
    cellBorder: color('--pixel-cell-border', FALLBACK.cellBorder),
    ok: color('--pixel-ok', FALLBACK.ok),
    error: color('--pixel-error', FALLBACK.error),
    colors: {
      red: color('--pixel-red', FALLBACK.colors.red),
      blue: color('--pixel-blue', FALLBACK.colors.blue),
      green: color('--pixel-green', FALLBACK.colors.green),
      yellow: color('--pixel-yellow', FALLBACK.colors.yellow),
      purple: color('--pixel-purple', FALLBACK.colors.purple),
      orange: color('--pixel-orange', FALLBACK.colors.orange),
      pink: color('--pixel-pink', FALLBACK.colors.pink),
    },
  };
}
