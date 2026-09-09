import type { CreateLevelParams, LevelSession, MechanicHost } from '../shell-contract.ts';
import { PixelDropGame } from './application/PixelDropGame.ts';
import { getLevel } from './levels/index.ts';
import './render/pixel-drop.css';

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const game = new PixelDropGame({
        level: getLevel(params.levelIndex),
        onComplete: params.onComplete,
      });
      game.mount(params.container);

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          game.destroy();
        },
      };
    },
  };
}
