import type { ColorId } from '../engine/types.ts';

/**
 * Bridge between the CSS design tokens and the Phaser scene.
 *
 * The DOM shell and the canvas render through completely different stacks; the
 * only way to stop them drifting apart visually is to make src/styles/tokens.css
 * the single source and have the canvas read it at runtime.
 */
export interface SceneTheme {
  background: number;
  cellEmpty: number;
  cellInactive: number;
  cellBorder: number;
  hintOk: number;
  hintWrong: number;
  hintPending: number;
  colors: Readonly<Record<ColorId, number>>;
}

const FALLBACK: SceneTheme = {
  background: 0x171a21,
  cellEmpty: 0x171a21,
  cellInactive: 0x14161b,
  cellBorder: 0x2a3039,
  hintOk: 0x34d399,
  hintWrong: 0xf87171,
  hintPending: 0x98a2b3,
  colors: {
    red: 0xef4444,
    blue: 0x3b82f6,
    green: 0x22c55e,
    yellow: 0xeab308,
    purple: 0xa855f7,
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
    cellInactive: color('--pixel-cell-inactive', FALLBACK.cellInactive),
    cellBorder: color('--pixel-cell-border', FALLBACK.cellBorder),
    hintOk: color('--pixel-hint-ok', FALLBACK.hintOk),
    hintWrong: color('--pixel-hint-wrong', FALLBACK.hintWrong),
    hintPending: color('--pixel-hint-pending', FALLBACK.hintPending),
    colors: {
      red: color('--pixel-red', FALLBACK.colors.red),
      blue: color('--pixel-blue', FALLBACK.colors.blue),
      green: color('--pixel-green', FALLBACK.colors.green),
      yellow: color('--pixel-yellow', FALLBACK.colors.yellow),
      purple: color('--pixel-purple', FALLBACK.colors.purple),
    },
  };
}
