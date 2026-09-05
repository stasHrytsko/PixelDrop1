import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  computeTargetCells,
  gridsEqual,
  isValidPlacement,
  pixelDropEngine,
  restoreFromPlacements,
} from '../../src/mechanic/engine/pixelDropEngine.ts';
import type { LevelConfig, Piece } from '../../src/mechanic/engine/types.ts';

/**
 * A tiny 3×3 hand-built level, not run through loadLevels.ts's parser — the
 * parser's own shape rules (exactly 4 cells, connected, etc.) are tested in
 * levels.test.ts. Here the engine only needs *some* pieces and a target:
 *
 *   targetGrid:  red  red  .
 *                .    .    blue
 *                green .   .
 *
 * pieceAB (2 cells) covers the red pair; pieceBlue and pieceGreen are single
 * cells. Together they cover exactly the picture's 4 filled cells, so a win
 * requires placing all three — nothing is left over to make that ambiguous.
 */
function buildLevel(): LevelConfig {
  const pieceAB: Piece = {
    id: 'red-pair',
    cells: [
      { offset: [0, 0], color: 'red' },
      { offset: [0, 1], color: 'red' },
    ],
  };
  const pieceBlue: Piece = { id: 'blue-single', cells: [{ offset: [0, 0], color: 'blue' }] };
  const pieceGreen: Piece = { id: 'green-single', cells: [{ offset: [0, 0], color: 'green' }] };

  return {
    id: 1,
    version: 1,
    rows: 3,
    cols: 3,
    palette: ['red', 'blue', 'green'],
    targetGrid: [
      [{ color: 'red' }, { color: 'red' }, null],
      [null, null, { color: 'blue' }],
      [{ color: 'green' }, null, null],
    ],
    pieces: [pieceAB, pieceBlue, pieceGreen],
    solutionPlacements: {
      'red-pair': { row: 0, col: 0 },
      'blue-single': { row: 1, col: 2 },
      'green-single': { row: 2, col: 0 },
    },
  };
}

// --- Pure helpers -------------------------------------------------------

describe('computeTargetCells', () => {
  it('offsets every cell from the anchor', () => {
    const piece: Piece = {
      id: 'p',
      cells: [
        { offset: [0, 0], color: 'red' },
        { offset: [1, -1], color: 'blue' },
      ],
    };
    expect(computeTargetCells(3, 3, piece)).toEqual([
      { row: 3, col: 3, color: 'red' },
      { row: 4, col: 2, color: 'blue' },
    ]);
  });
});

describe('isValidPlacement', () => {
  const level = buildLevel();

  it('accepts a placement fully inside the board that overlaps nothing', () => {
    expect(isValidPlacement(level.rows, level.cols, level.pieces, { 'red-pair': null, 'blue-single': null, 'green-single': null }, 'red-pair', 0, 0)).toBe(true);
  });

  it('rejects a placement that runs off the board', () => {
    expect(isValidPlacement(level.rows, level.cols, level.pieces, {}, 'red-pair', 0, 2)).toBe(false);
  });

  it('rejects a placement overlapping another already-placed piece', () => {
    const placements = { 'blue-single': { row: 0, col: 0 } };
    expect(isValidPlacement(level.rows, level.cols, level.pieces, placements, 'green-single', 0, 0)).toBe(false);
  });

  it("does not treat a piece's own current placement as an obstacle to itself", () => {
    const placements = { 'blue-single': { row: 1, col: 2 } };
    expect(isValidPlacement(level.rows, level.cols, level.pieces, placements, 'blue-single', 1, 2)).toBe(true);
  });

  it('rejects an unknown piece id', () => {
    expect(isValidPlacement(level.rows, level.cols, level.pieces, {}, 'nope', 0, 0)).toBe(false);
  });
});

describe('buildGrid / gridsEqual', () => {
  it('rebuilds the board from placements alone', () => {
    const level = buildLevel();
    const grid = buildGrid(level.rows, level.cols, level.pieces, {
      'red-pair': { row: 0, col: 0 },
      'blue-single': null,
      'green-single': null,
    });
    expect(grid[0]).toEqual([{ color: 'red' }, { color: 'red' }, null]);
    expect(grid[1]).toEqual([null, null, null]);
  });

  it('gridsEqual compares colour and emptiness, not object identity', () => {
    const a = [[{ color: 'red' as const }, null]];
    const b = [[{ color: 'red' as const }, null]];
    expect(gridsEqual(a, b)).toBe(true);
    expect(gridsEqual(a, [[{ color: 'blue' as const }, null]])).toBe(false);
  });
});

// --- Full engine flow -----------------------------------------------------

describe('pixelDropEngine — creation', () => {
  const state = pixelDropEngine.create(buildLevel());

  it('starts with every piece in the tray and an empty board', () => {
    expect(Object.values(state.placements)).toEqual([null, null, null]);
    expect(state.grid.flat().every((cell) => cell === null)).toBe(true);
    expect(state.gameState).toBe('playing');
  });
});

describe('pixelDropEngine — place', () => {
  it('writes the cells and updates placements on a valid placement', () => {
    const state = pixelDropEngine.create(buildLevel());
    const placed = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 0 });

    expect(placed.placements['red-pair']).toEqual({ row: 0, col: 0 });
    expect(placed.grid[0]).toEqual([{ color: 'red' }, { color: 'red' }, null]);
    expect(placed.gameState).toBe('playing');
  });

  it('rejects a geometrically invalid placement and leaves state untouched', () => {
    const state = pixelDropEngine.create(buildLevel());
    const rejected = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 2 });
    expect(rejected).toBe(state);
  });

  it('rejects overlapping another placed piece', () => {
    let state = pixelDropEngine.create(buildLevel());
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'blue-single', anchorRow: 0, anchorCol: 0 });
    const before = state;
    const rejected = pixelDropEngine.apply(state, { type: 'place', pieceId: 'green-single', anchorRow: 0, anchorCol: 0 });
    expect(rejected).toBe(before);
  });

  it('a placement geometrically fine but wrong relative to the picture is still accepted (docs/rules.md §3)', () => {
    const state = pixelDropEngine.create(buildLevel());
    const placed = pixelDropEngine.apply(state, { type: 'place', pieceId: 'blue-single', anchorRow: 2, anchorCol: 2 });
    expect(placed.placements['blue-single']).toEqual({ row: 2, col: 2 });
    expect(placed.gameState).toBe('playing');
  });

  it('moving an already-placed piece is not blocked by its own previous cells', () => {
    let state = pixelDropEngine.create(buildLevel());
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 0 });
    const moved = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 1 });
    expect(moved.placements['red-pair']).toEqual({ row: 0, col: 1 });
  });

  it('rejects an unknown piece id without throwing', () => {
    const state = pixelDropEngine.create(buildLevel());
    expect(pixelDropEngine.apply(state, { type: 'place', pieceId: 'nope', anchorRow: 0, anchorCol: 0 })).toBe(state);
  });
});

describe('pixelDropEngine — unplace', () => {
  it('returns a placed piece to the tray', () => {
    let state = pixelDropEngine.create(buildLevel());
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 0 });
    const back = pixelDropEngine.apply(state, { type: 'unplace', pieceId: 'red-pair' });

    expect(back.placements['red-pair']).toBeNull();
    expect(back.grid[0]).toEqual([null, null, null]);
  });

  it('is a free no-op on a piece already in the tray', () => {
    const state = pixelDropEngine.create(buildLevel());
    expect(pixelDropEngine.apply(state, { type: 'unplace', pieceId: 'red-pair' })).toBe(state);
  });
});

describe('pixelDropEngine — win', () => {
  function solve(): ReturnType<typeof pixelDropEngine.create> {
    let state = pixelDropEngine.create(buildLevel());
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 0 });
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'blue-single', anchorRow: 1, anchorCol: 2 });
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'green-single', anchorRow: 2, anchorCol: 0 });
    return state;
  }

  it('reaches won only once every piece matches the picture', () => {
    const state = solve();
    expect(state.gameState).toBe('won');
    expect(pixelDropEngine.isComplete(state)).toBe(true);
  });

  it('does not win while a piece is placed but in the wrong spot', () => {
    let state = pixelDropEngine.create(buildLevel());
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'red-pair', anchorRow: 0, anchorCol: 0 });
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'blue-single', anchorRow: 2, anchorCol: 2 }); // wrong spot
    state = pixelDropEngine.apply(state, { type: 'place', pieceId: 'green-single', anchorRow: 2, anchorCol: 0 });
    expect(state.gameState).toBe('playing');
  });

  it('ignores further input once won', () => {
    const won = solve();
    expect(pixelDropEngine.apply(won, { type: 'unplace', pieceId: 'red-pair' })).toBe(won);
    expect(pixelDropEngine.apply(won, { type: 'place', pieceId: 'red-pair', anchorRow: 1, anchorCol: 0 })).toBe(won);
  });
});

describe('restoreFromPlacements', () => {
  it('replays a saved placement map to the same state as applying it move by move', () => {
    const level = buildLevel();
    const restored = restoreFromPlacements(level, level.solutionPlacements);
    expect(restored.gameState).toBe('won');
  });

  it('silently skips a placement that is no longer valid rather than throwing', () => {
    const level = buildLevel();
    const restored = restoreFromPlacements(level, {
      'red-pair': { row: 0, col: 2 }, // now off the board for this piece's shape
      'blue-single': { row: 1, col: 2 },
    });
    expect(restored.placements['red-pair']).toBeNull();
    expect(restored.placements['blue-single']).toEqual({ row: 1, col: 2 });
  });

  it('ignores an entry for a piece the level does not have', () => {
    const level = buildLevel();
    const restored = restoreFromPlacements(level, { ghost: { row: 0, col: 0 } });
    expect(restored.placements['red-pair']).toBeNull();
  });
});
