import { expect, test, type Page } from '@playwright/test';
import { openLevelSelect, testId } from './helpers.ts';

/**
 * Mirrors src/mechanic/render/PixelDropScene.ts's #computeLayout exactly —
 * duplicated here rather than exposed from the scene, the same trade-off
 * docs/decisions.md D-010 already made for the progress storage key: the test
 * knows one fragile constant, documented at the source, rather than src/
 * carrying a test-only hook. Level 1's board is small enough (4×4) that
 * getting this formula wrong would show up immediately as a mis-hit tap.
 */
const HINT_MARGIN_CELLS = 2;
const GRID_SIZE = 8;
const TRAY_ROWS = 1.3;
const TRAY_GAP_CELLS = 0.25;
const MIN_CELL_SIZE = 18;

interface CanvasLayout {
  cellSize: number;
  boardX: number;
  boardY: number;
  traySlotCenter: (slot: 0 | 1 | 2) => { x: number; y: number };
}

function computeLayout(box: { x: number; y: number; width: number; height: number }): CanvasLayout {
  const totalCols = HINT_MARGIN_CELLS + GRID_SIZE;
  const totalRows = HINT_MARGIN_CELLS + GRID_SIZE + TRAY_ROWS;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(box.width / totalCols, box.height / totalRows));

  const usedWidth = cellSize * totalCols;
  const usedHeight = cellSize * totalRows;
  const offsetX = (box.width - usedWidth) / 2;
  const offsetY = (box.height - usedHeight) / 2;

  const boardX = box.x + offsetX + cellSize * HINT_MARGIN_CELLS;
  const boardY = box.y + offsetY + cellSize * HINT_MARGIN_CELLS;
  const trayY = boardY + cellSize * GRID_SIZE + cellSize * TRAY_GAP_CELLS;
  const trayHeight = cellSize * (TRAY_ROWS - TRAY_GAP_CELLS);
  const traySlotWidth = (cellSize * GRID_SIZE) / 3;

  return {
    cellSize,
    boardX,
    boardY,
    traySlotCenter: (slot) => ({
      x: boardX + traySlotWidth * (slot + 0.5),
      y: trayY + trayHeight / 2,
    }),
  };
}

async function getLayout(page: Page): Promise<CanvasLayout> {
  const canvas = testId(page, 'game-surface').locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Canvas has no layout box.');
  return computeLayout(box);
}

test.describe('Pixel Drop board', () => {
  test('placing the first piece, then undoing it, round-trips through real taps', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const layout = await getLayout(page);
    const undo = testId(page, 'pixel-drop-undo');
    const restart = testId(page, 'pixel-drop-restart');
    await expect(undo).toBeDisabled();
    await expect(restart).toBeEnabled();

    // Level 1's trayPieces[0] targets activeCells[0] = (row 0, col 0) by
    // construction (scripts/generate-levels.ts deals pieces in the same
    // row-major order it lists activeCells in).
    const trayCenter = layout.traySlotCenter(0);
    await page.mouse.click(trayCenter.x, trayCenter.y);

    const targetX = layout.boardX + layout.cellSize * 0.5;
    const targetY = layout.boardY + layout.cellSize * 0.5;
    await page.touchscreen.tap(targetX, targetY);

    // Placing a piece does not spend the undo budget — only undoing does.
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveText(/Откат \(3\)/);

    await undo.click();
    await expect(undo).toBeDisabled();
    await expect(undo).toHaveText(/Откат \(2\)/);
  });

  test('Restart puts an in-progress level back to its starting state', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const layout = await getLayout(page);
    await page.mouse.click(layout.traySlotCenter(0).x, layout.traySlotCenter(0).y);
    await page.touchscreen.tap(layout.boardX + layout.cellSize * 0.5, layout.boardY + layout.cellSize * 0.5);

    const undo = testId(page, 'pixel-drop-undo');
    await expect(undo).toBeEnabled();

    await testId(page, 'pixel-drop-restart').click();
    await expect(undo).toBeDisabled();
  });
});
