import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../shell-contract.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { PixelDropScene } from './render/PixelDropScene.ts';
import { readTheme } from './render/theme.ts';

/**
 * The mechanic's only export, and the only thing src/main.ts is allowed to
 * import from this folder.
 *
 * A whole Phaser.Game is created per level and destroyed with it. That costs a
 * few milliseconds on level change and buys a guarantee worth much more: no
 * state can leak from one level into the next.
 */
export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      const theme = readTheme();

      // The container belongs to the mechanic, so its HUD lives here rather
      // than in the shell — the shell must not know what "undo budget" means.
      const hud = document.createElement('div');
      hud.className = 'mechanic-hud pixel-drop-hud';
      hud.dataset['testid'] = 'mechanic-hud';

      const restartButton = document.createElement('button');
      restartButton.type = 'button';
      restartButton.className = 'btn btn--ghost';
      restartButton.textContent = 'Заново';
      restartButton.dataset['testid'] = 'pixel-drop-restart';

      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'btn btn--ghost';
      undoButton.dataset['testid'] = 'pixel-drop-undo';

      hud.append(undoButton, restartButton);

      const onStateChange = (state: LevelState): void => {
        undoButton.textContent = `Откат (${String(state.undoBudget)})`;
        undoButton.disabled = state.history.length === 0 || state.undoBudget === 0;
        hud.dataset['undoBudget'] = String(state.undoBudget);
        hud.dataset['stuck'] = String(state.isStuck);
        hud.dataset['gameState'] = state.gameState;
      };

      const scene = new PixelDropScene({
        level,
        theme,
        onComplete: params.onComplete,
        onStateChange,
      });

      undoButton.addEventListener('click', () => {
        scene.undo();
      });
      restartButton.addEventListener('click', () => {
        scene.restart();
      });

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: params.container,
        backgroundColor: theme.background,
        // Headless CI has no audio device; this also keeps it quiet.
        audio: { noAudio: true },
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: '100%',
          height: '100%',
        },
        scene: [scene],
      });

      params.container.append(hud);

      // params.onExit exists for mechanics that own their own exit affordance
      // (a pause menu inside the canvas). This one does not: the shell header
      // has the back button, so it is deliberately never called.

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          hud.remove();
          game.destroy(true);
        },
      };
    },
  };
}
