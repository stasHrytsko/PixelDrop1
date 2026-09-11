import { GAME } from '../../game.config.ts';
import type { LevelConfig } from '../engine/types.ts';
import rawLevelPack from './levels.json';
import { parseLevelPack } from './levelSchema.ts';

const LEVELS: readonly LevelConfig[] = parseLevelPack(rawLevelPack, GAME.levelCount);

function cloneLevel(level: LevelConfig): LevelConfig {
  return {
    ...level,
    object: level.object === null ? null : {
      ...level.object,
      size: [...level.object.size],
      voxels: level.object.voxels.map((voxel) => ({ ...voxel })),
    },
    phases: level.phases.map((phase) => ({
      ...phase,
      pieces: phase.pieces.map((piece) => ({
        ...piece,
        cells: piece.cells.map((cell) => ({ offset: [...cell.offset], color: cell.color })),
      })),
      target: phase.target.map((row) => row.slice()),
      initialPlacements: phase.initialPlacements.map((placement) => ({ ...placement })),
    })),
  };
}

export function getLevel(levelIndex: number): LevelConfig {
  const level = LEVELS[levelIndex];
  if (level === undefined) throw new Error('No level at index ' + String(levelIndex) + '.');
  return cloneLevel(level);
}

export function getAllLevels(): readonly LevelConfig[] {
  return LEVELS.map(cloneLevel);
}
