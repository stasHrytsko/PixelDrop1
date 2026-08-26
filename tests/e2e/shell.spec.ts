import { expect, test } from '@playwright/test';
import { openLevelSelect, testId } from './helpers.ts';

test.describe('shell', () => {
  test('opens on the main menu', async ({ page }) => {
    await page.goto('/');
    await expect(testId(page, 'game-title')).toBeVisible();
    await expect(testId(page, 'play')).toBeVisible();
  });

  test('does not scroll horizontally on a phone viewport', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows onboarding on the first run and skips it afterwards', async ({ page }) => {
    await openLevelSelect(page);

    await testId(page, 'levels-back').click();
    await testId(page, 'play').click();
    await expect(testId(page, 'level-select')).toBeVisible();
    await expect(testId(page, 'onboarding')).toBeHidden();
  });

  test('locks every level but the first', async ({ page }) => {
    await openLevelSelect(page);
    await expect(testId(page, 'level-1')).toHaveAttribute('data-state', 'unlocked');
    await expect(testId(page, 'level-2')).toHaveAttribute('data-state', 'locked');
    await expect(testId(page, 'level-9')).toBeVisible();
  });

  test('mounts and tears down the canvas around a level', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const canvas = testId(page, 'game-surface').locator('canvas');
    await expect(canvas).toBeVisible();

    await testId(page, 'game-back').click();
    await expect(testId(page, 'level-select')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
