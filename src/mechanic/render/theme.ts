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
  /** The page's own background, behind every card. */
  background: number;
  /** White card surface — the board, the thumbnail, each tray slot. */
  card: number;
  cardBorder: number;
  cellEmpty: number;
  cellBorder: number;
  text: number;
  textMuted: number;
  /** Drop feedback: a valid placement preview / a successful drop. Also the checkmark colour. */
  ok: number;
  /** Drop feedback: an invalid placement preview / a rejected drop. */
  error: number;
  colors: Readonly<Record<ColorId, number>>;
}

const FALLBACK: SceneTheme = {
  background: 0xeef0f7,
  card: 0xffffff,
  cardBorder: 0xe3e6f0,
  cellEmpty: 0xeceefa,
  cellBorder: 0xdde1ef,
  text: 0x1f2333,
  textMuted: 0x767c94,
  ok: 0x22b573,
  error: 0xef5757,
  colors: {
    red: 0xef4444,
    blue: 0x3b82f6,
    green: 0x22c55e,
    yellow: 0xeab308,
    purple: 0x9d6bff,
    orange: 0xf9a13e,
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
    background: color('--bg', FALLBACK.background),
    card: color('--surface', FALLBACK.card),
    cardBorder: color('--border', FALLBACK.cardBorder),
    cellEmpty: color('--pixel-cell-empty', FALLBACK.cellEmpty),
    cellBorder: color('--pixel-cell-border', FALLBACK.cellBorder),
    text: color('--text', FALLBACK.text),
    textMuted: color('--text-muted', FALLBACK.textMuted),
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
