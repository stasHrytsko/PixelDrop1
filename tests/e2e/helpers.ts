import { expect, type Page } from '@playwright/test';
import { LEVELS } from './levelPack.ts';

export function testId(page: Page, id: string) {
  return page.locator(`[data-testid="${id}"]`);
}

/** Walk from a cold start to the level grid, dismissing the first-run onboarding. */
export async function openLevelSelect(page: Page): Promise<void> {
  await page.goto('/');
  await expect(testId(page, 'main-menu')).toBeVisible();

  await testId(page, 'play').click();
  await expect(testId(page, 'onboarding')).toBeVisible();

  await testId(page, 'onboarding-continue').click();
  await expect(testId(page, 'level-select')).toBeVisible();
}

/** The canvas the mechanic mounted into the game surface. */
export function gameCanvas(page: Page) {
  return testId(page, 'game-surface').locator('canvas');
}

/**
 * Tap the canvas at a normalised (0..1) point, the way a finger would.
 *
 * touchscreen.tap rather than mouse.click: the target is Android, and a suite
 * that only ever clicks proves the mouse path works. These are real touch
 * events on real pixels — nothing here reaches into Phaser.
 */
export async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  const box = await gameCanvas(page).boundingBox();
  if (box === null) throw new Error('Canvas has no layout box.');
  await page.touchscreen.tap(box.x + x * box.width, box.y + y * box.height);
}

/**
 * Clear every target of the level currently on screen by tapping the canvas at
 * the coordinates the level pack declares.
 */
export async function clearCurrentLevel(page: Page, levelIndex: number): Promise<void> {
  const level = LEVELS[levelIndex];
  if (level === undefined) throw new Error(`No level at index ${String(levelIndex)}`);

  await expect(gameCanvas(page)).toBeVisible();

  const hud = testId(page, 'mechanic-hud');
  await expect(hud).toHaveAttribute('data-remaining', String(level.targets.length));

  for (let i = 0; i < level.targets.length; i += 1) {
    const target = level.targets[i];
    if (target === undefined) continue;

    await tapCanvas(page, target.x, target.y);
    await expect(hud).toHaveAttribute('data-remaining', String(level.targets.length - i - 1));
  }
}
