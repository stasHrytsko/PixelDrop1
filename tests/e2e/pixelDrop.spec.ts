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
const CARD_PADDING_UNITS = 0.4;
const HEADER_UNITS = 0.6;
const HINT_UNITS = 0.55;
const TRAY_HEADER_UNITS = 0.6;
const THUMB_LABEL_UNITS = 0.45;
const TRAY_SLOT_PADDING = 0.5;
const MIN_CELL_SIZE = 26;
const OUTER_MARGIN_PX = 16;
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

  const widthCellSize = (box.width - OUTER_MARGIN_PX * 2) / (COLS + CARD_PADDING_UNITS * 2);
  const totalRowUnits =
    CARD_PADDING_UNITS * 2 + ROWS * THUMB_SCALE + THUMB_LABEL_UNITS +
    GAP_UNITS +
    CARD_PADDING_UNITS * 2 + HEADER_UNITS + ROWS + HINT_UNITS +
    GAP_UNITS +
    TRAY_HEADER_UNITS + trayRows * traySlotUnits;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(widthCellSize, box.height / totalRowUnits));

  const contentHeight = cellSize * totalRowUnits;
  let cursorY = box.y + Math.max(0, (box.height - contentHeight) / 2);

  const thumbCardH = cellSize * CARD_PADDING_UNITS * 2 + ROWS * cellSize * THUMB_SCALE + cellSize * THUMB_LABEL_UNITS;
  cursorY += thumbCardH + GAP_UNITS * cellSize;

  const boardCardW = COLS * cellSize + cellSize * CARD_PADDING_UNITS * 2;
  const boardCardX = box.x + (box.width - boardCardW) / 2;
  const boardX = boardCardX + cellSize * CARD_PADDING_UNITS;
  const boardY = cursorY + cellSize * (CARD_PADDING_UNITS + HEADER_UNITS);
  const boardCardH = cellSize * (CARD_PADDING_UNITS * 2 + HEADER_UNITS + ROWS + HINT_UNITS);
  cursorY += boardCardH + GAP_UNITS * cellSize;

  cursorY += TRAY_HEADER_UNITS * cellSize;
  const traySlotSize = traySlotUnits * cellSize;
  const trayWidth = trayColumns * traySlotSize;
  const trayX = boardCardX + (boardCardW - trayWidth) / 2;
  const trayY = cursorY;

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
 * Drags the piece at tray slot `slotIndex` onto the board cell (targetRow,
 * targetCol). Every piece keeps a fixed tray slot for the whole level — a
 * placed slot shows a checkmark rather than shifting the rest of the tray
 * (PixelDropScene's #drawTray) — so `slotIndex` is simply that piece's index
 * in levels.json's pieces array, unaffected by what else is already placed.
 *
 * Dropping on a cell's centre with a piece grabbed from the tray lands its
 * anchor there exactly, because a tray grab always uses grabOffset (0, 0) —
 * see PixelDropScene's #onPointerDown. The drop's Y is nudged up by LIFT_PX
 * to compensate for the scene lifting the drag visually before computing the
 * drop cell from it — see #lifted.
 */
async function dragTrayPieceTo(page: Page, layout: CanvasLayout, slotIndex: number, targetRow: number, targetCol: number): Promise<void> {
  const from = traySlotCenter(layout, slotIndex);
  const to = cellCenter(layout, targetRow, targetCol);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y + LIFT_PX, { steps: 5 });
  await page.mouse.up();
}

// src/mechanic/levels/levels.json's pieces + solutionPlacements, in order —
// index N here is both the tray slot and the solved anchor for pieces[N].
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

    for (const [index, [row, col]] of SOLUTION.entries()) {
      await dragTrayPieceTo(page, layout, index, row, col);
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
    await dragTrayPieceTo(page, layout, 0, -1, 0);
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    // A valid, if "wrong", placement is accepted (docs/rules.md §3
    // "Проверка размещения" rule 2) — (4, 4) is not roof-left's solved spot.
    await dragTrayPieceTo(page, layout, 0, 4, 4);
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    await testId(page, 'pixel-drop-restart').click();

    // If Restart had not put every piece back in its tray slot, this full
    // solve would drag the wrong pieces to each spot and never reach 'won'.
    for (const [index, [row, col]] of SOLUTION.entries()) {
      await dragTrayPieceTo(page, layout, index, row, col);
    }
    await expect(hud).toHaveAttribute('data-game-state', 'won');
  });

  test('placing a piece swaps its tray slot for a checkmark', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const layout = await getLayout(page);
    await dragTrayPieceTo(page, layout, 0, 0, 1); // roof-left onto its solved spot

    // Slot 0 is now a checkmark, not the piece — dropping it back onto the
    // board a second time from the same slot must not pick anything up.
    await dragTrayPieceTo(page, layout, 0, 5, 5);
    const hud = testId(page, 'mechanic-hud');
    await expect(hud).toHaveAttribute('data-game-state', 'playing');

    // roof-left is still exactly where it was placed: sliding the rest of the
    // solution in still reaches 'won'.
    for (const [index, [row, col]] of SOLUTION.entries()) {
      if (index === 0) continue;
      await dragTrayPieceTo(page, layout, index, row, col);
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
