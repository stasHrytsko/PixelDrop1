import { expect, test, type Page } from '@playwright/test';
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
