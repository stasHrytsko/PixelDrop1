import { expect, test, type Page } from '@playwright/test';
import { GAME } from '../../src/game.config.ts';
import { clearCurrentLevel, openLevelSelect, testId } from './helpers.ts';
import { LEVELS } from './levelPack.ts';

/** Mirrors @capacitor/preferences' web fallback, which stores under this key. */
const STORAGE_KEY = `CapacitorStorage.progress:${GAME.id}`;

interface CapturedSignal {
  url: string;
  body: string | null;
}

/**
 * Intercepts the real network call the real NtfySignalSink makes. Nothing in
 * src/ knows it is under test — no test-only sink, no injected hook.
 */
async function captureSignals(page: Page): Promise<CapturedSignal[]> {
  const captured: CapturedSignal[] = [];

  await page.route('https://ntfy.sh/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      captured.push({ url: request.url(), body: request.postData() });
    }
    await route.fulfill({
      status: 200,
      body: '',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
      },
    });
  });

  return captured;
}

async function seedProgress(page: Page, completedLevels: number[], onboardingVersion: number) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        onboardingVersion,
        completedLevels,
        moreAsked: false,
      }),
    ],
  );
}

test.describe('playthrough', () => {
  // 45 real taps on a real canvas across nine level mounts.
  test.setTimeout(180_000);

  test('every level, then the "more?" signal', async ({ page }) => {
    const signals = await captureSignals(page);

    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    for (let index = 0; index < LEVELS.length; index += 1) {
      await clearCurrentLevel(page, index);

      if (index < LEVELS.length - 1) {
        await expect(testId(page, 'win-popup')).toBeVisible();
        await testId(page, 'next-level').click();
      }
    }

    // The last level ends with the product question, not the usual win popup.
    await expect(testId(page, 'more-popup')).toBeVisible();
    await expect(testId(page, 'win-popup')).toBeHidden();
    expect(signals).toHaveLength(0);

    await testId(page, 'more-yes').click();
    await expect(testId(page, 'level-select')).toBeVisible();

    expect(signals).toHaveLength(1);
    expect(signals[0]?.url).toMatch(/^https:\/\/ntfy\.sh\/[A-Za-z0-9_-]{16,64}$/);
    expect(signals[0]?.body).toBe(`game=${GAME.id} event=more_yes`);

    // Every level is marked solved on the grid.
    for (let index = 1; index <= GAME.levelCount; index += 1) {
      await expect(testId(page, `level-${String(index)}`)).toHaveAttribute(
        'data-state',
        'completed',
      );
    }
  });

  test('answering "no" sends nothing at all', async ({ page }) => {
    const signals = await captureSignals(page);

    // Start one level short of the end so this stays a focused test.
    const lastIndex = GAME.levelCount - 1;
    await seedProgress(
      page,
      Array.from({ length: lastIndex }, (_, index) => index),
      GAME.onboarding.version,
    );

    await page.goto('/');
    await testId(page, 'play').click();
    await testId(page, `level-${String(GAME.levelCount)}`).click();
    await clearCurrentLevel(page, lastIndex);

    await expect(testId(page, 'more-popup')).toBeVisible();
    await testId(page, 'more-no').click();
    await expect(testId(page, 'level-select')).toBeVisible();

    expect(signals).toHaveLength(0);
  });

  test('progress survives a full reload', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();
    await clearCurrentLevel(page, 0);
    await expect(testId(page, 'win-popup')).toBeVisible();
    await testId(page, 'to-levels').click();

    await page.reload();
    await testId(page, 'play').click();

    await expect(testId(page, 'level-1')).toHaveAttribute('data-state', 'completed');
    await expect(testId(page, 'level-2')).toHaveAttribute('data-state', 'unlocked');
  });
});
