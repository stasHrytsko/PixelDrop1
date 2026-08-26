import { GAME } from '../../game.config.ts';
import type { Level, Target } from '../engine/types.ts';
import rawLevelPack from './levels.json';

export const LEVELS_SCHEMA_VERSION = 1;

/**
 * Levels are data, and data from a file is untrusted until it is checked —
 * this is the one place in the mechanic where `unknown` is the correct type.
 * Everything downstream gets a fully narrowed `Level`.
 *
 * Validation throws rather than repairing: a level pack that does not match the
 * game is a bug to fix at build time, not a condition to survive at runtime.
 */
export function parseLevelPack(raw: unknown, expectedLevelCount: number): Level[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Level pack must be an object.');
  }
  const pack = raw as Record<string, unknown>;

  if (pack['schemaVersion'] !== LEVELS_SCHEMA_VERSION) {
    throw new Error(
      `Level pack schemaVersion must be ${String(LEVELS_SCHEMA_VERSION)}, got ${String(pack['schemaVersion'])}.`,
    );
  }

  const levels = pack['levels'];
  if (!Array.isArray(levels)) {
    throw new Error('Level pack must have a "levels" array.');
  }
  if (levels.length !== expectedLevelCount) {
    throw new Error(
      `Level pack has ${String(levels.length)} levels but GameDefinition.levelCount is ${String(expectedLevelCount)}.`,
    );
  }

  const seenTargetIds = new Set<string>();

  return levels.map((entry, index): Level => {
    const where = `levels[${String(index)}]`;
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`${where} must be an object.`);
    }
    const level = entry as Record<string, unknown>;

    if (level['id'] !== index + 1) {
      throw new Error(`${where}.id must be ${String(index + 1)}, got ${String(level['id'])}.`);
    }

    const targets = level['targets'];
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new Error(`${where}.targets must be a non-empty array.`);
    }

    const parsedTargets = targets.map((targetEntry, targetIndex): Target => {
      const targetWhere = `${where}.targets[${String(targetIndex)}]`;
      if (typeof targetEntry !== 'object' || targetEntry === null) {
        throw new Error(`${targetWhere} must be an object.`);
      }
      const target = targetEntry as Record<string, unknown>;

      const id = target['id'];
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`${targetWhere}.id must be a non-empty string.`);
      }
      if (seenTargetIds.has(id)) {
        throw new Error(`${targetWhere}.id ${JSON.stringify(id)} is not unique across the pack.`);
      }
      seenTargetIds.add(id);

      const x = target['x'];
      const y = target['y'];
      for (const [axis, value] of [
        ['x', x],
        ['y', y],
      ] as const) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error(`${targetWhere}.${axis} must be a number in [0, 1], got ${String(value)}.`);
        }
      }

      return { id, x: x as number, y: y as number };
    });

    return { id: index + 1, targets: parsedTargets };
  });
}

/** Validated at module load: a broken level pack must fail loudly and early. */
export const LEVELS: readonly Level[] = parseLevelPack(rawLevelPack, GAME.levelCount);

export function getLevel(levelIndex: number): Level {
  const level = LEVELS[levelIndex];
  if (level === undefined) {
    throw new Error(`No level at index ${String(levelIndex)} (pack has ${String(LEVELS.length)}).`);
  }
  return level;
}
