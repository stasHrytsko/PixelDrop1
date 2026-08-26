import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../shell-contract.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
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
      // than in the shell — the shell must not know what "remaining" means.
      const hud = document.createElement('div');
      hud.className = 'mechanic-hud';
      hud.dataset['testid'] = 'mechanic-hud';

      const onStateChange = (state: LevelState): void => {
        hud.textContent = `Осталось: ${String(state.remaining.length)}`;
        hud.dataset['remaining'] = String(state.remaining.length);
      };

      const scene = new LevelScene({
        level,
        theme,
        onComplete: params.onComplete,
        onStateChange,
      });

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: params.container,
        backgroundColor: theme.background,
        // No sound in the placeholder mechanic; this also keeps headless CI quiet.
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
