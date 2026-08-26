import { expect, type Page } from '@playwright/test';

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
