import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { LevelPhaseConfig, Piece, Placement } from '../../src/mechanic/engine/types.ts';
import { openLevelSelect, testId } from './helpers.ts';

interface RawPack {
  pieceSets: Record<string, Piece[]>;
  pictures: Record<string, Pick<LevelPhaseConfig, 'target'>>;
  levels: Array<{ phases: Array<{ id: number; view: LevelPhaseConfig['view']; picture: string; pieceSet: string; initialPlacements: Placement[] }> }>;
}
const pack = JSON.parse(readFileSync(new URL('../../src/mechanic/levels/levels.json', import.meta.url), 'utf8')) as unknown as RawPack;
const dogPhases: LevelPhaseConfig[] = pack.levels[0]!.phases.map((raw, index) => {
  const prefix = 'l1p' + String(index + 1) + '-';
  return {
    id: raw.id, view: raw.view, pictureId: raw.picture, title: '', instruction: '', sampleAlt: '',
    target: pack.pictures[raw.picture]!.target,
    pieces: pack.pieceSets[raw.pieceSet]!.map((piece) => ({ ...piece, id: prefix + piece.id })),
    initialPlacements: raw.initialPlacements.map((placement) => ({ ...placement, pieceId: prefix + placement.pieceId })),
  };
});
async function openFirstLevel(page: Page): Promise<void> {
  await openLevelSelect(page); await testId(page, 'level-1').click(); await expect(testId(page, 'pixel-drop-board')).toBeVisible();
}
async function move(page: Page, from: Placement, to: { row: number; col: number }): Promise<void> {
  await testId(page, 'pixel-drop-cell-' + String(from.row) + '-' + String(from.col)).click();
  await testId(page, 'pixel-drop-cell-' + String(to.row) + '-' + String(to.col)).click();
}
function matches(piece: Piece, phase: LevelPhaseConfig, row: number, col: number): boolean {
  return piece.cells.every((cell) => phase.target[row + cell.offset[0]]?.[col + cell.offset[1]] === cell.color);
}
function desiredPlacements(phase: LevelPhaseConfig): Placement[] {
  const used = new Set<string>();
  return phase.pieces.map((piece) => {
    for (let row = 0; row < 10; row += 2) for (let col = 0; col < 10; col += 2) {
      const key = String(row) + ',' + String(col);
      if (!used.has(key) && matches(piece, phase, row, col)) { used.add(key); return { pieceId: piece.id, row, col }; }
    }
    throw new Error('No solution anchor for ' + piece.id);
  });
}
async function solvePhase(page: Page, phase: LevelPhaseConfig): Promise<void> {
  const current = new Map(phase.initialPlacements.map((placement) => [placement.pieceId, { ...placement }]));
  const desired = desiredPlacements(phase);
  for (const target of desired) {
    const from = current.get(target.pieceId)!;
    if (from.row === target.row && from.col === target.col) continue;
    const displaced = [...current.values()].find((placement) => placement.row === target.row && placement.col === target.col);
    await move(page, from, target);
    current.set(target.pieceId, { ...target });
    if (displaced !== undefined) current.set(displaced.pieceId, { ...displaced, row: from.row, col: from.col });
  }
}

test.describe('Pixel Drop dog level', () => {
  test('shows a 10×10 board and the first unique set of 12 tetrominoes', async ({ page }) => {
    await openFirstLevel(page);
    await expect(testId(page, 'pixel-drop-board').getByRole('gridcell')).toHaveCount(100);
    await expect(page.getByRole('img', { name: /Первая проекция/ })).toBeVisible();
    await expect(page.locator('.pixel-drop-board-cell.occupied')).toHaveCount(48);
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('Картинка 1 из 3');
  });

  test('restores an unfinished arrangement after reload', async ({ page }) => {
    await openFirstLevel(page);
    const first = dogPhases[0]!.initialPlacements[0]!;
    await move(page, first, { row: 8, col: 8 });
    await expect(testId(page, 'pixel-drop-cell-8-8')).toHaveClass(/occupied/);
    await page.reload();
    await testId(page, 'continue-level').click();
    await expect(testId(page, 'pixel-drop-cell-8-8')).toHaveClass(/occupied/);
  });

  test('restart restores the phase-specific starting arrangement', async ({ page }) => {
    await openFirstLevel(page);
    const first = dogPhases[0]!.initialPlacements[0]!;
    await move(page, first, { row: 8, col: 8 });
    await testId(page, 'pixel-drop-restart').click();
    await expect(testId(page, 'pixel-drop-cell-' + String(first.row) + '-' + String(first.col))).toHaveClass(/occupied/);
  });

  test('reveals a rotatable 3D dog only after all three projections', async ({ page }) => {
    await openFirstLevel(page);
    for (let index = 0; index < 3; index += 1) {
      await solvePhase(page, dogPhases[index]!);
      if (index < 2) await expect(testId(page, 'pixel-drop-progress')).toHaveText('Картинка ' + String(index + 2) + ' из 3');
    }
    await expect(testId(page, 'voxel-reveal')).toBeVisible();
    await expect(testId(page, 'win-popup')).not.toBeVisible();
    await testId(page, 'voxel-continue').click();
    await expect(testId(page, 'win-popup')).toBeVisible();
  });
});
