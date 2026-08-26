import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/game.config.ts';
import { pixelDropEngine, validAnchorsForPiece } from '../../src/mechanic/engine/pixelDropEngine.ts';
import { getLevel, LEVELS, parseLevelPack } from '../../src/mechanic/levels/loadLevels.ts';

function validLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    gridSize: 8,
    activeCells: [[0, 0]],
    rowHints: [[{ count: 1, color: 'red' }], [], [], [], [], [], [], []],
    colHints: [[{ count: 1, color: 'red' }], [], [], [], [], [], [], []],
    trayPieces: [{ id: 'p1', cells: [{ offset: [0, 0], color: 'red' }] }],
    undoBudget: 3,
    onboardingStep: null,
    ...overrides,
  };
}

function pack(levels: Record<string, unknown>[] = [validLevel()], overrides: Record<string, unknown> = {}): unknown {
  return { schemaVersion: 1, levels, ...overrides };
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
   * A greedy solvability check, not a full backtracking solver: for every
   * piece the queue deals, place it on the first valid anchor found (scanning
   * row-major) and assert the level ends up won. This is correct for the
   * current placeholder content (§ generate-levels.ts) because every piece
   * is a single cell, so which specific piece fills a same-coloured cell
   * never changes the resulting picture. It is not a proof of solvability
   * for arbitrary multi-cell pieces — that is the real solver's job
   * (docs/rules.md §6), still to be built.
   */
  it('every shipped level is solvable by taking the first valid move each time', () => {
    for (const level of LEVELS) {
      let state = pixelDropEngine.create(level);
      let guard = 0;

      while (state.gameState !== 'won') {
        guard += 1;
        if (guard > 200) throw new Error(`Level ${String(level.id)} did not resolve within 200 moves.`);

        const slot = state.tray.findIndex((piece) => piece !== null);
        if (slot === -1) throw new Error(`Level ${String(level.id)}: tray exhausted without a win.`);

        const piece = state.tray[slot];
        if (piece === null || piece === undefined) throw new Error('Unreachable: findIndex guaranteed a piece.');
        const anchors = validAnchorsForPiece(state.grid, state.activeCells, piece);
        const anchor = anchors[0];
        if (anchor === undefined) throw new Error(`Level ${String(level.id)}: piece ${piece.id} has no valid move.`);

        state = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: slot as 0 | 1 | 2 });
        state = pixelDropEngine.apply(state, { type: 'tap_cell', row: anchor.row, col: anchor.col });
      }

      expect(state.gameState).toBe('won');
    }
  });
});

describe('parseLevelPack', () => {
  it('accepts a well-formed pack', () => {
    expect(parseLevelPack(pack(), 1)).toHaveLength(1);
  });

  it('rejects a wrong schema version', () => {
    expect(() => parseLevelPack(pack(undefined, { schemaVersion: 2 }), 1)).toThrow(/schemaVersion/);
  });

  it('rejects a level count that disagrees with GameDefinition', () => {
    expect(() => parseLevelPack(pack(), 9)).toThrow(/levelCount/);
  });

  it('rejects mis-numbered levels', () => {
    expect(() => parseLevelPack(pack([validLevel({ id: 7 })]), 1)).toThrow(/id must be 1/);
  });

  it('rejects a gridSize other than 8', () => {
    expect(() => parseLevelPack(pack([validLevel({ gridSize: 6 })]), 1)).toThrow(/gridSize/);
  });

  it('rejects an active area that is not a solid rectangle', () => {
    const level = validLevel({
      activeCells: [
        [0, 0],
        [0, 1],
        [1, 1], // (1,0) missing — an L, not a rectangle
      ],
      rowHints: [[{ count: 2, color: 'red' }], [{ count: 1, color: 'red' }], [], [], [], [], [], []],
      colHints: [[{ count: 1, color: 'red' }], [{ count: 2, color: 'red' }], [], [], [], [], [], []],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/solid rectangle/);
  });

  it('rejects a hint array with the wrong number of lines', () => {
    expect(() => parseLevelPack(pack([validLevel({ rowHints: [[]] })]), 1)).toThrow(/exactly 8/);
  });

  it('rejects a hint that names the same colour twice in one line', () => {
    const level = validLevel({ rowHints: [[{ count: 1, color: 'red' }, { count: 1, color: 'red' }], [], [], [], [], [], [], []] });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/same colour in two runs/);
  });

  it('rejects an empty trayPieces array', () => {
    expect(() => parseLevelPack(pack([validLevel({ trayPieces: [] })]), 1)).toThrow(/non-empty array/);
  });

  it('rejects a piece with more than 5 cells', () => {
    const cells = Array.from({ length: 6 }, (_, i) => ({ offset: [0, i], color: 'red' }));
    expect(() => parseLevelPack(pack([validLevel({ trayPieces: [{ id: 'p', cells }] })]), 1)).toThrow(/between 1 and 5/);
  });

  it('rejects a piece whose first cell is not the [0, 0] anchor', () => {
    const level = validLevel({
      trayPieces: [{ id: 'p', cells: [{ offset: [0, 1], color: 'red' }] }],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/anchor cell with offset \[0, 0\]/);
  });

  it('rejects duplicate piece ids within a level', () => {
    const level = validLevel({
      activeCells: [[0, 0], [0, 1]],
      trayPieces: [
        { id: 'same', cells: [{ offset: [0, 0], color: 'red' }] },
        { id: 'same', cells: [{ offset: [0, 0], color: 'red' }] },
      ],
    });
    expect(() => parseLevelPack(pack([level]), 1)).toThrow(/not unique/);
  });

  it('rejects a negative undoBudget', () => {
    expect(() => parseLevelPack(pack([validLevel({ undoBudget: -1 })]), 1)).toThrow(/undoBudget/);
  });

  it('rejects an unknown onboardingStep', () => {
    expect(() => parseLevelPack(pack([validLevel({ onboardingStep: 'nonsense' })]), 1)).toThrow(/onboardingStep/);
  });
});
