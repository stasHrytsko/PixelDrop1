import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixelDropGame } from '../../src/mechanic/application/PixelDropGame.ts';
import type { LevelConfig, LevelPhaseConfig } from '../../src/mechanic/engine/types.ts';

vi.mock('../../src/mechanic/render/VoxelReveal.ts', () => ({
  VoxelReveal: class {
    readonly element = document.createElement('div');
    constructor(_object: unknown, onContinue: () => void) {
      this.element.dataset.testid = 'voxel-reveal';
      const button = document.createElement('button');
      button.dataset.testid = 'voxel-continue';
      button.onclick = onContinue;
      this.element.append(button);
    }
    mount(container: HTMLElement): void { container.replaceChildren(this.element); }
    destroy(): void { this.element.remove(); }
  },
}));

const target = Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, col) =>
  row >= 2 && row <= 3 && col >= 2 && col <= 3 ? 'tan' as const :
    row >= 2 && row <= 3 && col >= 4 && col <= 5 ? 'red' as const : null,
));
function phase(id: number): LevelPhaseConfig {
  const pieceId = 'p' + String(id) + 'a';
  const secondId = 'p' + String(id) + 'b';
  return {
    id, view: (['front', 'side', 'bottom'] as const)[id - 1]!, pictureId: 'picture-' + String(id),
    title: 'Фаза', instruction: 'Собери', sampleAlt: 'Образец', target,
    pieces: [{ id: pieceId, label: 'O', cells: [
      { offset: [0, 0], color: 'tan' }, { offset: [0, 1], color: 'tan' },
      { offset: [1, 0], color: 'tan' }, { offset: [1, 1], color: 'tan' },
    ] }, { id: secondId, label: 'O', cells: [
      { offset: [0, 0], color: 'red' }, { offset: [0, 1], color: 'red' },
      { offset: [1, 0], color: 'red' }, { offset: [1, 1], color: 'red' },
    ] }],
    initialPlacements: [{ pieceId, row: 0, col: 0 }, { pieceId: secondId, row: 4, col: 0 }],
  };
}
const level: LevelConfig = {
  id: 1, gridSize: 10, phases: [phase(1), phase(2), phase(3)],
  object: { id: 'dog', label: 'Воксельная собака', size: [1, 1, 1], voxels: [{ x: 0, y: 0, z: 0, color: 'tan' }] },
};
function cell(row: number, col: number): HTMLButtonElement {
  const result = document.querySelector<HTMLButtonElement>('[data-testid="pixel-drop-cell-' + String(row) + '-' + String(col) + '"]');
  if (result === null) throw new Error('Missing cell');
  return result;
}
function solve(): void {
  cell(0, 0).click(); cell(2, 2).click();
  cell(4, 0).click(); cell(2, 4).click();
}

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('PixelDropGame phases, persistence and reveal', () => {
  it('persists every phase and completes only after the 3D reveal', async () => {
    const onComplete = vi.fn();
    const onStateChange = vi.fn();
    const game = new PixelDropGame({ level, onComplete, onStateChange });
    const container = document.createElement('div'); document.body.append(container); game.mount(container);
    expect(onStateChange).toHaveBeenCalled();
    solve(); await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.querySelector('[data-testid="pixel-drop-progress"]')?.textContent).toBe('Картинка 2 из 3');
    solve(); await new Promise((resolve) => setTimeout(resolve, 600));
    solve(); await new Promise((resolve) => setTimeout(resolve, 600)); await vi.dynamicImportSettled();
    expect(document.querySelector('[data-testid="voxel-reveal"]')).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-testid="voxel-continue"]')?.click();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const finalSnapshot = onStateChange.mock.calls.at(-1)?.[0] as { revealPending: boolean };
    expect(finalSnapshot.revealPending).toBe(true);
    game.destroy();
  });

  it('restores an unfinished phase from a JSON snapshot', () => {
    const snapshots: unknown[] = [];
    const first = new PixelDropGame({ level, onComplete: vi.fn(), onStateChange: (snapshot) => snapshots.push(snapshot) });
    const container = document.createElement('div'); document.body.append(container); first.mount(container);
    cell(0, 0).click(); cell(6, 6).click();
    const saved = snapshots.at(-1); first.destroy();
    expect((saved as { placements: Array<{ pieceId: string; row: number; col: number }> }).placements.find((item) => item.pieceId === 'p1a')).toMatchObject({ row: 6, col: 6 });
    const restored = new PixelDropGame({ level, resumeState: saved, onComplete: vi.fn() });
    restored.mount(container);
    expect(cell(6, 6).classList.contains('occupied')).toBe(true);
    restored.destroy();
  });
});
