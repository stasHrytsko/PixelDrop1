/**
 * Bridge between the CSS design tokens and the Phaser scene.
 *
 * The DOM shell and the canvas render through completely different stacks; the
 * only way to stop them drifting apart visually is to make src/styles/tokens.css
 * the single source and have the canvas read it at runtime.
 */
export interface SceneTheme {
  background: number;
  target: number;
  targetStroke: number;
  cleared: number;
  text: string;
}

const FALLBACK: SceneTheme = {
  background: 0x171a21,
  target: 0x5b8cff,
  targetStroke: 0x7aa2ff,
  cleared: 0x333a46,
  text: '#98a2b3',
};

function hexToNumber(value: string, fallback: number): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return fallback;
  return Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const styles = getComputedStyle(root);
  const token = (name: string): string => styles.getPropertyValue(name);

  return {
    background: hexToNumber(token('--surface'), FALLBACK.background),
    target: hexToNumber(token('--accent'), FALLBACK.target),
    targetStroke: hexToNumber(token('--accent-hover'), FALLBACK.targetStroke),
    cleared: hexToNumber(token('--locked'), FALLBACK.cleared),
    text: token('--text-muted').trim() || FALLBACK.text,
  };
}
