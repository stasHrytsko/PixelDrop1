import { afterEach, describe, expect, it, vi } from 'vitest';

import { PixelDropGame } from '../../src/mechanic/application/PixelDropGame.ts';
import type { LevelConfig } from '../../src/mechanic/engine/types.ts';
import { getLevel } from '../../src/mechanic/levels/index.ts';

function cell(row: number, col: number): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(
    '[data-testid="pixel-drop-cell-' + String(row) + '-' + String(col) + '"]',
  );
  if (element === null) throw new Error('Missing board cell.');
  return element;
}

function move(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
  cell(fromRow, fromCol).click();
  cell(toRow, toCol).click();
}

function solveHouse(): void {
  move(0, 6, 2, 4);
  move(4, 0, 7, 3);
  move(4, 7, 3, 2);
  move(8, 7, 3, 5);
  move(0, 0, 5, 3);
  move(8, 0, 5, 4);
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('PixelDropGame phases', () => {
  it('reports level completion only after all three pictures', () => {
    vi.useFakeTimers();
    const source = getLevel(0);
    const first = source.phases[0];
    if (first === undefined) throw new Error('Missing first phase.');
    const level: LevelConfig = {
      ...source,
      phases: [first, { ...first, id: 2 }, { ...first, id: 3 }],
    };
    const onComplete = vi.fn();
    const game = new PixelDropGame({ level, onComplete });
    const container = document.createElement('div');
    document.body.append(container);
    game.mount(container);

    solveHouse();
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="pixel-drop-progress"]')?.textContent).toBe(
      'Картинка 1 из 3 готова!',
    );
    vi.advanceTimersByTime(560);
    expect(document.querySelector('[data-testid="pixel-drop-progress"]')?.textContent).toBe('Картинка 2 из 3');

    solveHouse();
    vi.advanceTimersByTime(560);
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="pixel-drop-progress"]')?.textContent).toBe('Картинка 3 из 3');

    solveHouse();
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(560);
    expect(onComplete).toHaveBeenCalledTimes(1);

    game.destroy();
  });
});
