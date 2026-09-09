import { expect, test, type Locator, type Page } from '@playwright/test';
import { openLevelSelect, testId } from './helpers.ts';

async function openFirstLevel(page: Page): Promise<void> {
  await openLevelSelect(page);
  await testId(page, 'level-1').click();
  await expect(testId(page, 'pixel-drop-board')).toBeVisible();
}

async function place(page: Page, piece: number, row: number, col: number): Promise<void> {
  await testId(page, 'pixel-drop-piece-' + String(piece)).click();
  await testId(page, 'pixel-drop-cell-' + String(row) + '-' + String(col)).click();
}

async function dragBetween(page: Page, from: Locator, to: Locator): Promise<void> {
  const [fromBox, toBox] = await Promise.all([from.boundingBox(), to.boundingBox()]);
  if (fromBox === null || toBox === null) throw new Error('Drag endpoints must be visible.');

  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 6 });
  await page.mouse.up();
}

test.describe('Pixel Drop picture board', () => {
  test('matches the reference structure: sample, 6×6 board and six-piece tray', async ({ page }) => {
    await openFirstLevel(page);

    await expect(testId(page, 'pixel-drop-board').getByRole('gridcell')).toHaveCount(36);
    await expect(page.getByRole('img', { name: /Образец: домик/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Доступные фигуры' }).getByRole('button')).toHaveCount(6);
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('0 / 6 фигур');
    await expect(page.getByText('Можно переставлять сколько угодно')).toBeVisible();
  });

  test('places pieces, restarts, and restores the full tray', async ({ page }) => {
    await openFirstLevel(page);
    await place(page, 2, 0, 2);
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('1 / 6 фигур');
    await expect(testId(page, 'pixel-drop-piece-2')).toHaveClass(/used/);

    for (const [row, col] of [[0, 2], [0, 3], [1, 2], [1, 3]]) {
      await expect(testId(page, 'pixel-drop-cell-' + String(row) + '-' + String(col))).toHaveCSS(
        'background-color',
        'rgb(245, 164, 84)',
      );
    }

    await testId(page, 'pixel-drop-restart').click();
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('0 / 6 фигур');
    await expect(testId(page, 'pixel-drop-piece-2')).not.toHaveClass(/used/);
  });

  test('drags tray and placed pieces without partial placement', async ({ page }) => {
    await openFirstLevel(page);
    const piece = testId(page, 'pixel-drop-piece-2');
    const pieceAnchor = piece.locator('.pixel-drop-pixel[data-dr="0"][data-dc="0"]');
    const occupiedCells = page.locator('.pixel-drop-board-cell.occupied');

    await dragBetween(page, pieceAnchor, testId(page, 'pixel-drop-cell-5-5'));
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('0 / 6 фигур');
    await expect(occupiedCells).toHaveCount(0);

    await dragBetween(page, pieceAnchor, testId(page, 'pixel-drop-cell-0-2'));
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('1 / 6 фигур');
    await expect(occupiedCells).toHaveCount(4);

    await dragBetween(page, testId(page, 'pixel-drop-cell-1-3'), testId(page, 'pixel-drop-cell-4-5'));
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('1 / 6 фигур');
    await expect(testId(page, 'pixel-drop-cell-0-2')).not.toHaveClass(/occupied/);
    await expect(testId(page, 'pixel-drop-cell-3-4')).toHaveClass(/occupied/);
    await expect(occupiedCells).toHaveCount(4);
  });

  test('completes the exact house sample', async ({ page }) => {
    await openFirstLevel(page);
    await place(page, 2, 0, 2);
    await place(page, 4, 1, 0);
    await place(page, 6, 1, 3);
    await place(page, 1, 3, 1);
    await place(page, 3, 5, 1);
    await place(page, 5, 3, 2);

    await expect(testId(page, 'pixel-drop-progress')).toHaveText('6 / 6 фигур');
    await expect(testId(page, 'win-popup')).toBeVisible();
  });
});
