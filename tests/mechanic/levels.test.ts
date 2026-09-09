import { describe, expect, it } from 'vitest';

import {
  getAllLevels,
  getLevel,
  parseLevelPack,
} from '../../src/mechanic/levels/index.ts';

const sourceLevel = getLevel(0);

function validPack(): unknown {
  return {
    schemaVersion: 5,
    pieceSets: {
      test: sourceLevel.pieces,
    },
    pictures: {
      test: {
        title: 'Test picture',
        instruction: 'Recreate the sample',
        sampleAlt: 'Test sample',
        target: sourceLevel.phases[0]?.target,
      },
    },
    levels: [
      {
        id: 1,
        gridSize: 10,
        pieceSet: 'test',
        phases: sourceLevel.phases.map((phase) => ({
          id: phase.id,
          picture: 'test',
          initialPlacements: phase.initialPlacements,
        })),
      },
    ],
  };
}

describe('level pack', () => {
  it('ships nine playable 10x10 levels with three pictures each', () => {
    const levels = getAllLevels();

    expect(levels).toHaveLength(9);
    expect(new Set(levels.flatMap((level) => level.phases.map((phase) => JSON.stringify(phase.target)))).size).toBe(9);

    for (const level of levels) {
      expect(level.gridSize).toBe(10);
      expect(level.pieces).toHaveLength(6);
      expect(level.phases).toHaveLength(3);
      for (const phase of level.phases) {
        expect(phase.target).toHaveLength(10);
        expect(phase.target.every((row) => row.length === 10)).toBe(true);
        expect(phase.initialPlacements).toHaveLength(6);
      }
    }
  });

  it('returns immutable copies instead of sharing mutable level data', () => {
    const firstRead = getLevel(0);
    const secondRead = getLevel(0);

    expect(firstRead).not.toBe(secondRead);
    expect(firstRead.pieces).not.toBe(secondRead.pieces);
    expect(firstRead.phases).not.toBe(secondRead.phases);
    expect(firstRead.phases[0]?.target).not.toBe(secondRead.phases[0]?.target);
    expect(firstRead.phases[0]?.initialPlacements).not.toBe(secondRead.phases[0]?.initialPlacements);
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

    expect(() => parseLevelPack(wrongSchema, 1)).toThrow(/schemaVersion must be 5/);

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
      pictures: { test: { target: Array<Array<string | null>> } };
    };
    badInventory.pictures.test.target[0]![0] = 'coral';

    expect(() => parseLevelPack(badInventory, 1)).toThrow(/same number/);
  });

  it('rejects targets that have the right colors but cannot be tiled', () => {
    const unsolvable = validPack() as {
      pictures: { test: { target: Array<Array<string | null>> } };
    };
    const target = unsolvable.pictures.test.target;

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

  it('rejects levels that do not contain exactly three phases', () => {
    const wrongPhaseCount = validPack() as {
      levels: Array<{ phases: unknown[] }>;
    };
    wrongPhaseCount.levels[0]!.phases.pop();

    expect(() => parseLevelPack(wrongPhaseCount, 1)).toThrow(/exactly 3 phases/);
  });
});
