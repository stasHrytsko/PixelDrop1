import { describe, expect, it } from 'vitest';
import { computeRuns, lineStatusFor, pixelDropEngine } from '../../src/mechanic/engine/pixelDropEngine.ts';
import type { LevelConfig, LevelState, Piece } from '../../src/mechanic/engine/types.ts';

// --- Pure line-status helpers, tested directly against docs/rules.md §3 "Состояние линии" ---

describe('computeRuns', () => {
  it('coalesces consecutive same-colour cells and empty cells close a run', () => {
    const cells = [
      { color: 'red' as const },
      { color: 'red' as const },
      null,
      { color: 'blue' as const },
      { color: 'blue' as const },
      { color: 'blue' as const },
    ];
    expect(computeRuns(cells)).toEqual([
      { color: 'red', count: 2 },
      { color: 'blue', count: 3 },
    ]);
  });

  it('a colour change with no gap between still closes the run (rule 18)', () => {
    const cells = [{ color: 'red' as const }, { color: 'blue' as const }];
    expect(computeRuns(cells)).toEqual([
      { color: 'red', count: 1 },
      { color: 'blue', count: 1 },
    ]);
  });

  it('an empty line has no runs', () => {
    expect(computeRuns([null, null, null])).toEqual([]);
  });
});

describe('lineStatusFor', () => {
  it('empty active line with an empty hint is ok (not pending)', () => {
    expect(lineStatusFor([null, null], [])).toBe('ok');
  });

  it('exact match, in order, is ok', () => {
    const cells = [{ color: 'red' as const }, null, { color: 'blue' as const }];
    const hint = [{ count: 1, color: 'red' as const }, { count: 1, color: 'blue' as const }];
    expect(lineStatusFor(cells, hint)).toBe('ok');
  });

  it('partially filled, no violation yet, is pending', () => {
    const cells = [{ color: 'red' as const }, null, null];
    const hint = [{ count: 2, color: 'red' as const }];
    expect(lineStatusFor(cells, hint)).toBe('pending');
  });

  it('wrong (а): fully filled but the runs do not match', () => {
    const cells = [{ color: 'red' as const }, { color: 'blue' as const }];
    const hint = [{ count: 2, color: 'red' as const }];
    expect(lineStatusFor(cells, hint)).toBe('wrong');
  });

  it('wrong (б): a colour with no run in the hint at all', () => {
    const cells = [{ color: 'green' as const }, null];
    const hint = [{ count: 1, color: 'red' as const }];
    expect(lineStatusFor(cells, hint)).toBe('wrong');
  });

  it('wrong (в): a colour run longer than the hint declares for it', () => {
    const cells = [{ color: 'red' as const }, { color: 'red' as const }, { color: 'red' as const }];
    const hint = [{ count: 2, color: 'red' as const }];
    expect(lineStatusFor(cells, hint)).toBe('wrong');
  });

  it('wrong (г): a colour forms more than one run in the line', () => {
    const cells = [{ color: 'red' as const }, null, { color: 'red' as const }];
    const hint = [{ count: 1, color: 'red' as const }];
    expect(lineStatusFor(cells, hint)).toBe('wrong');
  });
});

// --- Full engine flow, against a small hand-built level -----------------------------------

/**
 * A 3×3 active corner inside the 8×8 board (rows/cols 0–2). Target picture:
 *   row0: red  red  .
 *   row1: .    .    blue
 *   row2: green .   .
 *
 * Five single-cell pieces: P1/P2/P3/P4 place that picture, P5 is a deliberate
 * extra that is still unplaced when the win happens — the win must not depend
 * on the queue running out. The queue length (5, not a multiple of 3) also
 * means placing P1–P3 drains the tray and pulls a refill of exactly 2
 * (P4, P5), covering rule 27's "fewer than three left" case for a refill too.
 */
function buildMainLevel(): LevelConfig {
  const piece = (id: string, color: Piece['cells'][number]['color']): Piece => ({
    id,
    cells: [{ offset: [0, 0], color }],
  });

  return {
    id: 1,
    gridSize: 8,
    activeCells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ],
    rowHints: [
      [{ count: 2, color: 'red' }],
      [{ count: 1, color: 'blue' }],
      [{ count: 1, color: 'green' }],
      [], [], [], [], [],
    ],
    colHints: [
      [{ count: 1, color: 'red' }, { count: 1, color: 'green' }],
      [{ count: 1, color: 'red' }],
      [{ count: 1, color: 'blue' }],
      [], [], [], [], [],
    ],
    trayPieces: [piece('p1', 'red'), piece('p2', 'red'), piece('p3', 'blue'), piece('p4', 'green'), piece('p5', 'red')],
    undoBudget: 2,
    onboardingStep: null,
  };
}

describe('pixelDropEngine — creation', () => {
  const level = buildMainLevel();
  const state = pixelDropEngine.create(level);

  it('deals the first three pieces and leaves the rest queued', () => {
    expect(state.tray.map((p) => p?.id ?? null)).toEqual(['p1', 'p2', 'p3']);
    expect(state.nextPieceIndex).toBe(3);
  });

  it('starts with an empty board and no selection', () => {
    expect(state.grid.flat().every((cell) => cell === null)).toBe(true);
    expect(state.selectedPieceIdx).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.gameState).toBe('playing');
  });

  it('lines with an empty hint on an inactive row/col are ok; the rest are pending', () => {
    expect(state.lineStatus.rows.slice(0, 3)).toEqual(['pending', 'pending', 'pending']);
    expect(state.lineStatus.rows.slice(3)).toEqual(Array(5).fill('ok'));
    expect(state.lineStatus.cols.slice(3)).toEqual(Array(5).fill('ok'));
  });

  it('is not stuck — every tray piece has somewhere to go', () => {
    expect(state.isStuck).toBe(false);
  });
});

describe('pixelDropEngine — selecting a piece', () => {
  const level = buildMainLevel();
  const state = pixelDropEngine.create(level);

  it('tap on an occupied slot selects it', () => {
    const next = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 });
    expect(next.selectedPieceIdx).toBe(0);
  });

  it('tap on the already-selected slot has no further effect (rule 7)', () => {
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 });
    const again = pixelDropEngine.apply(selected, { type: 'tap_piece', traySlot: 0 });
    expect(again.selectedPieceIdx).toBe(0);
  });

  it('tap on a different occupied slot moves the selection', () => {
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 });
    const moved = pixelDropEngine.apply(selected, { type: 'tap_piece', traySlot: 1 });
    expect(moved.selectedPieceIdx).toBe(1);
  });

  it('tap on a background/nothing clears the selection', () => {
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 });
    const cleared = pixelDropEngine.apply(selected, { type: 'tap_background' });
    expect(cleared.selectedPieceIdx).toBeNull();
  });

  it('tap on an out-of-range slot index does nothing', () => {
    // The renderer only ever sends 0|1|2, but the engine must not throw on a
    // stale slot index either (e.g. a slot spent between render and tap).
    const next = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 as 0 | 1 | 2 });
    expect(next.selectedPieceIdx).toBe(0);
  });
});

describe('pixelDropEngine — placement', () => {
  function selectAndPlace(state: LevelState, traySlot: 0 | 1 | 2, row: number, col: number): LevelState {
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot });
    return pixelDropEngine.apply(selected, { type: 'tap_cell', row, col });
  }

  it('tap on a cell with nothing selected does nothing (rule 11)', () => {
    const state = pixelDropEngine.create(buildMainLevel());
    const next = pixelDropEngine.apply(state, { type: 'tap_cell', row: 0, col: 0 });
    expect(next).toBe(state);
  });

  it('rejects a placement reaching outside the active area, keeping the piece selected', () => {
    // p3 is a single cell; anchoring it at (0, 5) lands on an inactive cell.
    const state = pixelDropEngine.create(buildMainLevel());
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 2 });
    const rejected = pixelDropEngine.apply(selected, { type: 'tap_cell', row: 0, col: 5 });
    expect(rejected.grid).toEqual(state.grid);
    expect(rejected.tray).toEqual(state.tray);
    expect(rejected.selectedPieceIdx).toBe(2);
    expect(rejected.history).toEqual([]);
  });

  it('rejects a placement onto an already-occupied cell', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0); // p1 -> (0,0)
    const before = state;
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 1 });
    const rejected = pixelDropEngine.apply(selected, { type: 'tap_cell', row: 0, col: 0 });
    expect(rejected.grid).toEqual(before.grid);
    expect(rejected.history).toHaveLength(1);
  });

  it('a valid placement writes the cells, records history, spends the slot, clears selection', () => {
    const state = pixelDropEngine.create(buildMainLevel());
    const placed = selectAndPlace(state, 0, 0, 0);

    expect(placed.grid[0]?.[0]).toEqual({ color: 'red' });
    expect(placed.tray[0]).toBeNull();
    expect(placed.selectedPieceIdx).toBeNull();
    expect(placed.history).toEqual([{ pieceId: 'p1', traySlot: 0, cells: [{ row: 0, col: 0, color: 'red' }] }]);
  });

  it('does not refill until every slot is spent (rules 26–28)', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0); // p1
    expect(state.tray.map((p) => p?.id ?? null)).toEqual([null, 'p2', 'p3']);
    expect(state.nextPieceIndex).toBe(3);

    state = selectAndPlace(state, 1, 0, 1); // p2
    expect(state.tray.map((p) => p?.id ?? null)).toEqual([null, null, 'p3']);
    expect(state.nextPieceIndex).toBe(3);

    // Draining the last slot pulls the next batch — only 2 pieces are left, so
    // the third slot stays null rather than the deal failing (rule 27).
    state = selectAndPlace(state, 2, 1, 2); // p3
    expect(state.tray.map((p) => p?.id ?? null)).toEqual(['p4', 'p5', null]);
    expect(state.nextPieceIndex).toBe(5);
  });

  it('completes the picture and reports the win; further input is then ignored', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0); // p1 red -> (0,0)
    state = selectAndPlace(state, 1, 0, 1); // p2 red -> (0,1)
    state = selectAndPlace(state, 2, 1, 2); // p3 blue -> (1,2), triggers refill
    expect(state.gameState).toBe('playing');

    state = selectAndPlace(state, 0, 2, 0); // p4 green -> (2,0)
    expect(state.gameState).toBe('won');
    expect(pixelDropEngine.isComplete(state)).toBe(true);
    expect(state.lineStatus.rows.slice(0, 3)).toEqual(['ok', 'ok', 'ok']);
    expect(state.lineStatus.cols.slice(0, 3)).toEqual(['ok', 'ok', 'ok']);
    // p5 was dealt by the refill but never placed — winning does not require it.
    expect(state.tray.some((p) => p?.id === 'p5')).toBe(true);

    const wonState = state;
    expect(pixelDropEngine.apply(wonState, { type: 'tap_piece', traySlot: 1 })).toBe(wonState);
    expect(pixelDropEngine.apply(wonState, { type: 'tap_cell', row: 3, col: 3 })).toBe(wonState);
    expect(pixelDropEngine.apply(wonState, { type: 'tap_undo' })).toBe(wonState);
  });
});

describe('pixelDropEngine — undo', () => {
  function selectAndPlace(state: LevelState, traySlot: 0 | 1 | 2, row: number, col: number): LevelState {
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot });
    return pixelDropEngine.apply(selected, { type: 'tap_cell', row, col });
  }

  it('does nothing with an empty history', () => {
    const state = pixelDropEngine.create(buildMainLevel());
    expect(pixelDropEngine.apply(state, { type: 'tap_undo' })).toBe(state);
  });

  it('un-places the last move and refunds its tray slot', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0); // p1 -> (0,0)
    const undone = pixelDropEngine.apply(state, { type: 'tap_undo' });

    expect(undone.grid[0]?.[0]).toBeNull();
    expect(undone.tray.map((p) => p?.id ?? null)).toEqual(['p1', 'p2', 'p3']);
    expect(undone.history).toEqual([]);
    expect(undone.undoBudget).toBe(1); // started at 2
    expect(undone.selectedPieceIdx).toBeNull();
  });

  it('correctly reverses a refill: undoing the move that emptied the tray restores the pre-refill batch', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0); // p1
    state = selectAndPlace(state, 1, 0, 1); // p2
    state = selectAndPlace(state, 2, 1, 2); // p3 — drains the tray, refill pulls p4/p5
    expect(state.tray.map((p) => p?.id ?? null)).toEqual(['p4', 'p5', null]);

    const undone = pixelDropEngine.apply(state, { type: 'tap_undo' });

    // p4/p5 must not have been silently discarded by the refund landing in slot 2.
    expect(undone.tray.map((p) => p?.id ?? null)).toEqual([null, null, 'p3']);
    expect(undone.nextPieceIndex).toBe(3);
    expect(undone.grid[1]?.[2]).toBeNull();
    expect(undone.history).toHaveLength(2);
    expect(undone.undoBudget).toBe(1);
  });

  it('refuses once the budget is spent, even with history left to undo', () => {
    let state = pixelDropEngine.create(buildMainLevel()); // undoBudget: 2
    state = selectAndPlace(state, 0, 0, 0);
    state = pixelDropEngine.apply(state, { type: 'tap_undo' }); // budget -> 1
    state = selectAndPlace(state, 0, 0, 0);
    state = pixelDropEngine.apply(state, { type: 'tap_undo' }); // budget -> 0
    expect(state.undoBudget).toBe(0);

    state = selectAndPlace(state, 0, 0, 0);
    const before = state;
    const refused = pixelDropEngine.apply(state, { type: 'tap_undo' });
    expect(refused).toBe(before);
  });

  it('undo can only ever remove one move at a time', () => {
    let state = pixelDropEngine.create(buildMainLevel());
    state = selectAndPlace(state, 0, 0, 0);
    state = selectAndPlace(state, 1, 0, 1);
    const undoneOnce = pixelDropEngine.apply(state, { type: 'tap_undo' });
    expect(undoneOnce.history).toHaveLength(1);
  });
});

describe('pixelDropEngine — stuck', () => {
  /**
   * A single active row of three cells. p1 is a single cell (always placeable
   * somewhere on an almost-empty board); p2 is a vertical two-cell piece,
   * which this one-row board can never fit no matter what is filled — its
   * second cell always lands on an inactive row.
   */
  function buildLevel(): LevelConfig {
    return {
      id: 2,
      gridSize: 8,
      activeCells: [[0, 0], [0, 1], [0, 2]],
      rowHints: [[{ count: 1, color: 'red' }], [], [], [], [], [], [], []],
      // col1/col2 stay unmet on purpose, so placing the single red cell into
      // col0 does not win the level outright — the test needs "playing" and
      // "stuck" to coexist to be meaningful.
      colHints: [
        [{ count: 1, color: 'red' }],
        [{ count: 1, color: 'blue' }],
        [{ count: 1, color: 'green' }],
        [], [], [], [], [],
      ],
      trayPieces: [
        { id: 'single', cells: [{ offset: [0, 0], color: 'red' }] },
        {
          id: 'vertical',
          cells: [
            { offset: [0, 0], color: 'red' },
            { offset: [1, 0], color: 'red' },
          ],
        },
      ],
      undoBudget: 1,
      onboardingStep: null,
    };
  }

  it('is not stuck while a placeable piece remains in the tray', () => {
    const state = pixelDropEngine.create(buildLevel());
    expect(state.isStuck).toBe(false); // "single" still fits; "vertical" never does
  });

  it('becomes stuck once the only placeable piece is spent, and recovers on undo', () => {
    let state = pixelDropEngine.create(buildLevel());
    const selected = pixelDropEngine.apply(state, { type: 'tap_piece', traySlot: 0 });
    state = pixelDropEngine.apply(selected, { type: 'tap_cell', row: 0, col: 0 });

    expect(state.gameState).toBe('playing'); // col1/col2 are still unmet
    expect(state.isStuck).toBe(true); // only "vertical" remains, and it fits nowhere on a one-row board

    const undone = pixelDropEngine.apply(state, { type: 'tap_undo' });
    expect(undone.isStuck).toBe(false); // "single" is back in the tray
  });
});
