import type { CreateLevelParams, LevelSession, MechanicHost } from '../shell-contract.ts';
import { getLevel } from './levels/loadLevels.ts';
import { PixelDropScene } from './render/PixelDropScene.ts';
import './render/pixel-drop.css';

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const scene = new PixelDropScene({
        level: getLevel(params.levelIndex),
        onComplete: params.onComplete,
      });
      scene.mount(params.container);

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          scene.destroy();
        },
      };
    },
  };
}
