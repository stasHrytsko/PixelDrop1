import { expect, test, type Locator, type Page } from '@playwright/test';
import { openLevelSelect, testId } from './helpers.ts';

async function openFirstLevel(page: Page): Promise<void> {
  await openLevelSelect(page);
  await testId(page, 'level-1').click();
  await expect(testId(page, 'pixel-drop-board')).toBeVisible();
}

async function movePiece(page: Page, fromRow: number, fromCol: number, row: number, col: number): Promise<void> {
  await testId(page, 'pixel-drop-cell-' + String(fromRow) + '-' + String(fromCol)).click();
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
  test('shows the sample above a spacious 10×10 board with every piece already placed', async ({ page }) => {
    await openFirstLevel(page);

    await expect(testId(page, 'pixel-drop-board').getByRole('gridcell')).toHaveCount(100);
    await expect(page.getByRole('img', { name: /Образец: домик/ })).toBeVisible();
    await expect(page.locator('.pixel-drop-board-cell.occupied')).toHaveCount(24);
    await expect(testId(page, 'pixel-drop-progress')).toHaveText('6 фигур на поле');
    await expect(page.getByText('Перетаскивай или меняй фигуры местами')).toBeVisible();
  });

  test('moves a piece and restores the initial field on restart', async ({ page }) => {
    await openFirstLevel(page);
    await movePiece(page, 0, 6, 2, 4);
    await expect(testId(page, 'pixel-drop-cell-0-6')).not.toHaveClass(/occupied/);
    await expect(testId(page, 'pixel-drop-cell-2-4')).toHaveClass(/occupied/);
    await expect(page.locator('.pixel-drop-board-cell.occupied')).toHaveCount(24);

    await testId(page, 'pixel-drop-restart').click();
    await expect(testId(page, 'pixel-drop-cell-0-6')).toHaveClass(/occupied/);
    await expect(testId(page, 'pixel-drop-cell-2-4')).not.toHaveClass(/occupied/);
  });

  test('drags field pieces without partial placement', async ({ page }) => {
    await openFirstLevel(page);
    const occupiedCells = page.locator('.pixel-drop-board-cell.occupied');

    await dragBetween(page, testId(page, 'pixel-drop-cell-0-0'), testId(page, 'pixel-drop-cell-9-9'));
    await expect(occupiedCells).toHaveCount(24);
    await expect(testId(page, 'pixel-drop-cell-0-0')).toHaveClass(/occupied/);

    await dragBetween(page, testId(page, 'pixel-drop-cell-0-0'), testId(page, 'pixel-drop-cell-2-0'));
    await expect(occupiedCells).toHaveCount(24);
    await expect(testId(page, 'pixel-drop-cell-0-0')).not.toHaveClass(/occupied/);
    await expect(testId(page, 'pixel-drop-cell-2-0')).toHaveClass(/occupied/);

    await dragBetween(page, testId(page, 'pixel-drop-cell-3-2'), testId(page, 'pixel-drop-cell-7-6'));
    await expect(testId(page, 'pixel-drop-cell-2-0')).not.toHaveClass(/occupied/);
    await expect(testId(page, 'pixel-drop-cell-6-4')).toHaveClass(/occupied/);
    await expect(occupiedCells).toHaveCount(24);
  });

  test('swaps two figures when one is dragged onto another', async ({ page }) => {
    await openFirstLevel(page);

    await dragBetween(page, testId(page, 'pixel-drop-cell-0-0'), testId(page, 'pixel-drop-cell-0-6'));
    await expect(testId(page, 'pixel-drop-cell-0-0')).toHaveClass(/coral/);
    await expect(testId(page, 'pixel-drop-cell-0-6')).toHaveClass(/rose/);
    await expect(page.locator('.pixel-drop-board-cell.occupied')).toHaveCount(24);
  });

  test('completes the exact house sample', async ({ page }) => {
    await openFirstLevel(page);
    await movePiece(page, 0, 6, 2, 4);
    await movePiece(page, 4, 0, 7, 3);
    await movePiece(page, 4, 7, 3, 2);
    await movePiece(page, 8, 7, 3, 5);
    await movePiece(page, 0, 0, 5, 3);
    await movePiece(page, 8, 0, 5, 4);

    await expect(testId(page, 'pixel-drop-progress')).toHaveText('Готово!');
    await expect(testId(page, 'win-popup')).toBeVisible();
  });
});
