import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/game.config.ts';
import { GRID_SIZE, TRAY_SIZE } from '../../src/mechanic/engine/types.ts';
import { getLevel, LEVELS, parseLevelPack } from '../../src/mechanic/levels/loadLevels.ts';

function validPack(): Record<string, unknown> {
  const level = getLevel(0);
  return {
    schemaVersion: 2,
    board: {
      gridSize: GRID_SIZE,
      target: level.target,
      pieces: level.pieces,
    },
    levels: [{ id: 1, title: 'Шесть деталей', instruction: 'Собери рисунок', sampleAlt: 'Образец' }],
  };
}

describe('shipped picture-mode levels', () => {
  it('matches GameDefinition and uses the reference 6×6 / six-piece format', () => {
    expect(LEVELS).toHaveLength(GAME.levelCount);
    expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: GAME.levelCount }, (_, index) => index + 1));
    for (const level of LEVELS) {
      expect(level.gridSize).toBe(6);
      expect(level.target).toHaveLength(6);
      expect(level.target.every((row) => row.length === 6)).toBe(true);
      expect(level.pieces).toHaveLength(6);
    }
  });

  it('exposes levels by index and refuses an out-of-range index', () => {
    expect(getLevel(0).id).toBe(1);
    expect(() => getLevel(GAME.levelCount)).toThrow(/No level at index/);
  });
});

describe('parseLevelPack', () => {
  it('accepts a valid picture-mode pack', () => {
    expect(parseLevelPack(validPack(), 1)).toHaveLength(1);
  });

  it('rejects the old schema and 8×8 boards', () => {
    expect(() => parseLevelPack({ ...validPack(), schemaVersion: 1 }, 1)).toThrow(/schemaVersion/);
    const pack = validPack();
    pack['board'] = { ...(pack['board'] as Record<string, unknown>), gridSize: 8 };
    expect(() => parseLevelPack(pack, 1)).toThrow(/gridSize/);
  });

  it('requires exactly six pieces', () => {
    const pack = validPack();
    const board = pack['board'] as Record<string, unknown>;
    board['pieces'] = (board['pieces'] as unknown[]).slice(0, TRAY_SIZE - 1);
    expect(() => parseLevelPack(pack, 1)).toThrow(/exactly 6 pieces/);
  });

  it('rejects a target whose color inventory does not match the pieces', () => {
    const pack = validPack();
    const board = pack['board'] as Record<string, unknown>;
    const target = (board['target'] as (string | null)[][]).map((row) => row.slice());
    target[0]![0] = 'coral';
    board['target'] = target;
    expect(() => parseLevelPack(pack, 1)).toThrow(/same number of coral/);
  });
});
