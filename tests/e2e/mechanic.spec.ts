import { expect, test } from '@playwright/test';
import { gameCanvas, openLevelSelect, tapCanvas, testId } from './helpers.ts';
import { LEVELS } from './levelPack.ts';

/**
 * The board itself, through real touch events.
 *
 * The rules of the placeholder mechanic live in docs/rules.md; rule 3 says a tap
 * on empty board counts as a tap without clearing anything. The engine could
 * always express that, but the scene only listened on the circles, so the rule
 * was unreachable in the actual game while a unit test covered it.
 */
test.describe('tap targets board', () => {
  test('a tap on empty board counts without clearing a target', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();
    await expect(gameCanvas(page)).toBeVisible();

    const hud = testId(page, 'mechanic-hud');
    await expect(hud).toHaveAttribute('data-remaining', '1');
    await expect(hud).toHaveAttribute('data-taps', '0');

    // The only target of level 1 sits at the centre; this corner is empty board.
    const target = LEVELS[0]?.targets[0];
    expect(target).toEqual({ id: expect.any(String), x: 0.5, y: 0.5 });

    await tapCanvas(page, 0.08, 0.9);
    await expect(hud).toHaveAttribute('data-taps', '1');
    await expect(hud).toHaveAttribute('data-remaining', '1');
    await expect(testId(page, 'win-popup')).toBeHidden();

    await tapCanvas(page, 0.12, 0.85);
    await expect(hud).toHaveAttribute('data-taps', '2');
    await expect(hud).toHaveAttribute('data-remaining', '1');

    // The target still clears, and the miss is still on the counter.
    await tapCanvas(page, 0.5, 0.5);
    await expect(hud).toHaveAttribute('data-remaining', '0');
    await expect(hud).toHaveAttribute('data-taps', '3');
    await expect(testId(page, 'win-popup')).toBeVisible();
  });

  test('a tap on a cleared target counts as a miss', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();
    await expect(gameCanvas(page)).toBeVisible();

    const hud = testId(page, 'mechanic-hud');
    await tapCanvas(page, 0.5, 0.5);
    await expect(hud).toHaveAttribute('data-remaining', '0');
    await expect(hud).toHaveAttribute('data-taps', '1');
  });
});
