import { expect, test, type Page } from '@playwright/test';
import { openLevelSelect, testId } from './helpers.ts';

/**
 * Mirrors src/mechanic/render/PixelDropScene.ts's #computeLayout and the
 * always-lifted drop math exactly — duplicated here rather than exposed from
 * the scene, the same trade-off docs/decisions.md D-010 already made for the
 * progress storage key: the test knows a handful of fragile constants,
 * documented at the source, rather than src/ carrying a test-only hook.
 *
 * The shipped level's 6 pieces are all 2×2 squares (docs/rules.md §3
 * "Текущий прототип"), so MAX_SPAN and PIECE_COUNT below are this level's
 * actual shape, not a guess.
 */
const ROWS = 6;
const COLS = 6;
const PIECE_COUNT = 6;
const MAX_SPAN = 2;
const THUMB_SCALE = 0.42;
const GAP_UNITS = 0.5;
const TRAY_SLOT_PADDING = 0.5;
const MIN_CELL_SIZE = 26;
const LIFT_PX = 34;

interface CanvasLayout {
  cellSize: number;
  boardX: number;
  boardY: number;
  trayX: number;
  trayY: number;
  traySlotSize: number;
  trayColumns: number;
}

function computeLayout(box: { x: number; y: number; width: number; height: number }): CanvasLayout {
  const traySlotUnits = MAX_SPAN + TRAY_SLOT_PADDING;
  const trayColumns = Math.max(1, Math.floor(COLS / traySlotUnits));
  const trayRows = Math.ceil(PIECE_COUNT / trayColumns);

  const totalRowUnits = ROWS * THUMB_SCALE + GAP_UNITS + ROWS + GAP_UNITS + trayRows * traySlotUnits;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(box.width / COLS, box.height / totalRowUnits));

  const contentHeight = cellSize * totalRowUnits;
  const offsetY = (box.height - contentHeight) / 2;
  const thumbHeight = ROWS * cellSize * THUMB_SCALE;
  const thumbY = box.y + offsetY;

  const boardWidth = COLS * cellSize;
  const boardHeight = ROWS * cellSize;
  const boardX = box.x + (box.width - boardWidth) / 2;
  const boardY = thumbY + thumbHeight + GAP_UNITS * cellSize;

  const traySlotSize = traySlotUnits * cellSize;
  const trayWidth = trayColumns * traySlotSize;
  const trayX = boardX + (boardWidth - trayWidth) / 2;
  const trayY = boardY + boardHeight + GAP_UNITS * cellSize;

  return { cellSize, boardX, boardY, trayX, trayY, traySlotSize, trayColumns };
}

function cellCenter(layout: CanvasLayout, row: number, col: number): { x: number; y: number } {
  return { x: layout.boardX + (col + 0.5) * layout.cellSize, y: layout.boardY + (row + 0.5) * layout.cellSize };
}

function traySlotCenter(layout: CanvasLayout, index: number): { x: number; y: number } {
  const col = index % layout.trayColumns;
  const row = Math.floor(index / layout.trayColumns);
  return {
    x: layout.trayX + col * layout.traySlotSize + layout.traySlotSize / 2,
    y: layout.trayY + row * layout.traySlotSize + layout.traySlotSize / 2,
  };
}

async function getLayout(page: Page): Promise<CanvasLayout> {
  const canvas = testId(page, 'game-surface').locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Canvas has no layout box.');
  return computeLayout(box);
}

/**
 * Drags whatever currently sits in tray slot 0 onto the board cell
 * (targetRow, targetCol). Dropping on a cell's centre with a piece grabbed
 * from the tray lands its anchor there exactly, because a tray grab always
 * uses grabOffset (0, 0) — see PixelDropScene's #onPointerDown.
 *
 * The drop's Y is nudged up by LIFT_PX to compensate for the scene lifting
 * the drag visually before computing the drop cell from it — see #lifted.
 */
async function dragFirstTrayPieceTo(page: Page, layout: CanvasLayout, targetRow: number, targetCol: number): Promise<void> {
  const from = traySlotCenter(layout, 0);
  const to = cellCenter(layout, targetRow, targetCol);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y + LIFT_PX, { steps: 5 });
  await page.mouse.up();
}

// src/mechanic/levels/levels.json's solutionPlacements, in the same order as
// the level's pieces array — dragging in that order always pulls the next
// piece from tray slot 0 (docs/rules.md §3 "Старт уровня").
const SOLUTION: readonly (readonly [number, number])[] = [
  [0, 1], // roof-left
  [0, 3], // roof-right
  [2, 0], // wall-left
  [2, 2], // wall-mid
  [2, 4], // wall-right
  [4, 2], // door
];

test.describe('Pixel Drop board', () => {
  test('dragging every piece to its solved position wins the level', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const layout = await getLayout(page);
    const hud = testId(page, 'mechanic-hud');
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    for (const [row, col] of SOLUTION) {
      await dragFirstTrayPieceTo(page, layout, row, col);
    }

    await expect(hud).toHaveAttribute('data-game-state', 'won');
    await expect(testId(page, 'win-popup')).toBeVisible();
    await expect(testId(page, 'replay-level')).toBeVisible();
  });

  test('an invalid drop is rejected, and Restart genuinely returns every piece to the tray', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const layout = await getLayout(page);
    const hud = testId(page, 'mechanic-hud');

    // Off the board entirely (row -1 is out of bounds for a 2×2 piece) — rejected, nothing changes.
    await dragFirstTrayPieceTo(page, layout, -1, 0);
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    // A valid, if "wrong", placement is accepted (docs/rules.md §3
    // "Проверка размещения" rule 2) — (4, 4) is not roof-left's solved spot.
    await dragFirstTrayPieceTo(page, layout, 4, 4);
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    await testId(page, 'pixel-drop-restart').click();

    // If Restart had not put roof-left back at tray slot 0, this full solve
    // would drag the wrong pieces to each spot and never reach 'won'.
    for (const [row, col] of SOLUTION) {
      await dragFirstTrayPieceTo(page, layout, row, col);
    }
    await expect(hud).toHaveAttribute('data-game-state', 'won');
  });

  test('the "?" help panel opens and closes without leaving the level', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    await expect(testId(page, 'pixel-drop-help-panel')).toBeHidden();
    await testId(page, 'pixel-drop-help').click();
    await expect(testId(page, 'pixel-drop-help-panel')).toBeVisible();

    await testId(page, 'pixel-drop-help-close').click();
    await expect(testId(page, 'pixel-drop-help-panel')).toBeHidden();
  });
});
