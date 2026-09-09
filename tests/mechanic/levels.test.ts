import { describe, expect, it } from 'vitest';

import {
  getAllLevels,
  getLevel,
  parseLevelPack,
} from '../../src/mechanic/levels/index.ts';

const sourceLevel = getLevel(0);

function validPack(): unknown {
  return {
    schemaVersion: 4,
    pieceSets: {
      test: sourceLevel.pieces,
    },
    levels: [
      {
        id: 1,
        gridSize: 10,
        pieceSet: 'test',
        title: 'Test level',
        instruction: 'Recreate the sample',
        sampleAlt: 'Test sample',
        initialPlacements: sourceLevel.initialPlacements,
        target: sourceLevel.target,
      },
    ],
  };
}

describe('level pack', () => {
  it('ships nine distinct, playable 10x10 levels', () => {
    const levels = getAllLevels();

    expect(levels).toHaveLength(9);
    expect(new Set(levels.map((level) => JSON.stringify(level.target))).size).toBe(9);

    for (const level of levels) {
      expect(level.gridSize).toBe(10);
      expect(level.target).toHaveLength(10);
      expect(level.target.every((row) => row.length === 10)).toBe(true);
      expect(level.pieces).toHaveLength(6);
      expect(level.initialPlacements).toHaveLength(6);
    }
  });

  it('returns immutable copies instead of sharing mutable level data', () => {
    const firstRead = getLevel(0);
    const secondRead = getLevel(0);

    expect(firstRead).not.toBe(secondRead);
    expect(firstRead.target).not.toBe(secondRead.target);
    expect(firstRead.pieces).not.toBe(secondRead.pieces);
    expect(firstRead.initialPlacements).not.toBe(secondRead.initialPlacements);
    expect(firstRead).toEqual(secondRead);
  });

  it('accepts a valid versioned pack', () => {
    const parsed = parseLevelPack(validPack(), 1);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.pieces).toHaveLength(6);
  });

  it('rejects an unsupported schema and non-10x10 boards', () => {
    const wrongSchema = validPack() as Record<string, unknown>;
    wrongSchema.schemaVersion = 2;

    expect(() => parseLevelPack(wrongSchema, 1)).toThrow(/schemaVersion must be 4/);

    const wrongGrid = validPack() as {
      levels: Array<Record<string, unknown>>;
    };
    wrongGrid.levels[0]!.gridSize = 8;

    expect(() => parseLevelPack(wrongGrid, 1)).toThrow(/gridSize must be 10/);
  });

  it('rejects missing piece sets and sets that do not contain six figures', () => {
    const unknownSet = validPack() as {
      levels: Array<Record<string, unknown>>;
    };
    unknownSet.levels[0]!.pieceSet = 'missing';

    expect(() => parseLevelPack(unknownSet, 1)).toThrow(/unknown set/);

    const shortTray = validPack() as {
      pieceSets: Record<string, unknown[]>;
    };
    shortTray.pieceSets.test = shortTray.pieceSets.test!.slice(0, 5);

    expect(() => parseLevelPack(shortTray, 1)).toThrow(/exactly 6 pieces/);
  });

  it('rejects targets whose color inventory does not match the pieces', () => {
    const badInventory = validPack() as {
      levels: Array<{ target: Array<Array<string | null>> }>;
    };
    badInventory.levels[0]!.target[0]![0] = 'coral';

    expect(() => parseLevelPack(badInventory, 1)).toThrow(/same number/);
  });

  it('rejects targets that have the right colors but cannot be tiled', () => {
    const unsolvable = validPack() as {
      levels: Array<{ target: Array<Array<string | null>> }>;
    };
    const target = unsolvable.levels[0]!.target;

    target[6]![4] = null;
    target[6]![5] = null;
    target[7]![4] = null;
    target[7]![5] = null;
    target[0]![0] = 'purple';
    target[0]![9] = 'purple';
    target[9]![0] = 'purple';
    target[9]![9] = 'purple';

    expect(() => parseLevelPack(unsolvable, 1)).toThrow(/cannot be tiled/);
  });
});
