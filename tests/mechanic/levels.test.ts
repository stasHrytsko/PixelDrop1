import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/game.config.ts';
import { restoreFromPlacements } from '../../src/mechanic/engine/pixelDropEngine.ts';
import { getLevel, LEVELS, parseLevelPack } from '../../src/mechanic/levels/loadLevels.ts';

function validLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    version: 1,
    rows: 2,
    cols: 2,
    palette: ['red'],
    targetGrid: [
      [{ color: 'red' }, { color: 'red' }],
      [{ color: 'red' }, { color: 'red' }],
    ],
    pieces: [
      {
        id: 'p1',
        cells: [
          { offset: [0, 0], color: 'red' },
          { offset: [0, 1], color: 'red' },
          { offset: [1, 0], color: 'red' },
          { offset: [1, 1], color: 'red' },
        ],
      },
    ],
    solutionPlacements: { p1: { row: 0, col: 0 } },
    ...overrides,
  };
}

function pack(levels: Record<string, unknown>[] = [validLevel()], overrides: Record<string, unknown> = {}): unknown {
  return { schemaVersion: 2, levels, ...overrides };
}

describe('shipped level pack', () => {
  it('has exactly GameDefinition.levelCount levels, numbered in order', () => {
    expect(LEVELS).toHaveLength(GAME.levelCount);
    expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: GAME.levelCount }, (_, i) => i + 1));
  });

  it('exposes levels by index and refuses out-of-range ones', () => {
    expect(getLevel(0).id).toBe(1);
    expect(() => getLevel(GAME.levelCount)).toThrow(/No level at index/);
  });

  /**
   * docs/rules.md §6 authoring check 3: solutionPlacements, replayed through
   * the real engine, must reach the real targetGrid. This is what actually
   * proves a level is solvable — parseLevelPack only checks shape.
   */
  it('every shipped level is solved by its own solutionPlacements', () => {
    for (const level of LEVELS) {
      const solved = restoreFromPlacements(level, level.solutionPlacements);
      expect(solved.gameState).toBe('won');
    }
  });
});

describe('parseLevelPack', () => {
  it('accepts a well-formed pack', () => {
    expect(parseLevelPack(pack(), 1)).toHaveLength(1);
  });

  it('rejects a wrong schema version', () => {
    expect(() => parseLevelPack(pack(undefined, { schemaVersion: 1 }), 1)).toThrow(/schemaVersion/);
  });

  it('rejects a level count that disagrees with GameDefinition', () => {
    expect(() => parseLevelPack(pack(), 9)).toThrow(/levelCount/);
  });

  it('rejects mis-numbered levels', () => {
    expect(() => parseLevelPack(pack([validLevel({ id: 7 })]), 1)).toThrow(/id must be 1/);
  });

  it('rejects a non-integer version', () => {
    expect(() => parseLevelPack(pack([validLevel({ version: 0 })]), 1)).toThrow(/version/);
  });

  it('rejects a grid whose row count disagrees with `rows`', () => {
    const level = validLevel({ targetGrid: [[{ color: 'red' }, { color: 'red' }]] });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/exactly 2 rows/);
  });

  it('rejects a palette missing a colour a piece actually uses', () => {
    expect(() => parseLevelPack(pack([validLevel({ palette: ['blue'] })]), 1)).toThrow(/does not list colour/);
  });

  it('rejects a piece without exactly 4 cells', () => {
    const level = validLevel({
      pieces: [{ id: 'p1', cells: [{ offset: [0, 0], color: 'red' }] }],
      solutionPlacements: { p1: { row: 0, col: 0 } },
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/exactly 4 cells/);
  });

  it('rejects a piece whose first cell is not the [0, 0] anchor', () => {
    const level = validLevel({
      pieces: [
        {
          id: 'p1',
          cells: [
            { offset: [0, 1], color: 'red' },
            { offset: [0, 0], color: 'red' },
            { offset: [1, 0], color: 'red' },
            { offset: [1, 1], color: 'red' },
          ],
        },
      ],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/anchor cell with offset \[0, 0\]/);
  });

  it('rejects a piece whose four cells are not one connected tetromino', () => {
    const level = validLevel({
      pieces: [
        {
          id: 'p1',
          cells: [
            { offset: [0, 0], color: 'red' },
            { offset: [0, 1], color: 'red' },
            { offset: [5, 5], color: 'red' },
            { offset: [5, 6], color: 'red' },
          ],
        },
      ],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/connected tetromino/);
  });

  it('rejects duplicate piece ids within a level', () => {
    const square = [
      { offset: [0, 0], color: 'red' },
      { offset: [0, 1], color: 'red' },
      { offset: [1, 0], color: 'red' },
      { offset: [1, 1], color: 'red' },
    ];
    const level = validLevel({
      pieces: [
        { id: 'same', cells: square },
        { id: 'same', cells: square },
      ],
      solutionPlacements: { same: { row: 0, col: 0 } },
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/not unique/);
  });

  it('rejects solutionPlacements missing an entry for a piece', () => {
    expect(() => parseLevelPack(pack([validLevel({ solutionPlacements: {} })]), 1)).toThrow(/missing a placement/);
  });

  it('rejects solutionPlacements with an anchor outside the board', () => {
    const level = validLevel({ solutionPlacements: { p1: { row: 9, col: 9 } } });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/within the board/);
  });

  it('rejects a filled-cell count that disagrees with 4 × piece count', () => {
    const level = validLevel({
      targetGrid: [
        [{ color: 'red' }, { color: 'red' }],
        [{ color: 'red' }, null],
      ],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/but 1 pieces cover 4/);
  });
});
