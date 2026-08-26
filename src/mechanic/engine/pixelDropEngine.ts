import {
  GRID_SIZE,
  TRAY_SIZE,
  type Cell,
  type ColorId,
  type GameInput,
  type LevelConfig,
  type LevelState,
  type LineHint,
  type LineStatus,
  type MechanicEngine,
  type PieceCell,
  type Piece,
  type PlacedMove,
  type Run,
} from './types.ts';

/**
 * Pixel Drop's rules, straight from docs/rules.md. Every exported function
 * below is named after the section it implements so the mapping stays
 * traceable; the section numbers in comments are docs/rules.md's own.
 */

// --- Board shape --------------------------------------------------------

function emptyGrid(): Cell[][] {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

function activeCellsGrid(active: readonly (readonly [number, number])[]): boolean[][] {
  const grid = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => false));
  for (const [row, col] of active) {
    const gridRow = grid[row];
    if (gridRow === undefined) continue;
    gridRow[col] = true;
  }
  return grid;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

function column<T>(grid: readonly (readonly T[])[], col: number): T[] {
  return grid.map((row) => {
    const value = row[col];
    if (value === undefined) throw new Error(`Column ${String(col)} out of range.`);
    return value;
  });
}

// --- §3 "Размещение": target cells and validity --------------------------

export interface TargetCell {
  readonly row: number;
  readonly col: number;
  readonly color: ColorId;
}

/** Rule 12–13: every piece cell's absolute position given an anchor. */
export function computeTargetCells(anchorRow: number, anchorCol: number, piece: Piece): TargetCell[] {
  return piece.cells.map((cell: PieceCell) => ({
    row: anchorRow + cell.offset[0],
    col: anchorCol + cell.offset[1],
    color: cell.color,
  }));
}

/** Rule 14–15: every cell of the piece must be active and empty. */
export function isValidPlacement(
  grid: readonly (readonly Cell[])[],
  activeCells: readonly (readonly boolean[])[],
  targets: readonly TargetCell[],
): boolean {
  return targets.every(({ row, col }) => {
    if (!inBounds(row, col)) return false;
    const activeRow = activeCells[row];
    const gridRow = grid[row];
    if (activeRow?.[col] !== true) return false;
    return gridRow?.[col] === null;
  });
}

/** Every anchor on the board where `piece` has a valid placement — feeds the selection highlight (§7). */
export function validAnchorsForPiece(
  grid: readonly (readonly Cell[])[],
  activeCells: readonly (readonly boolean[])[],
  piece: Piece,
): { row: number; col: number }[] {
  const anchors: { row: number; col: number }[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isValidPlacement(grid, activeCells, computeTargetCells(row, col, piece))) {
        anchors.push({ row, col });
      }
    }
  }
  return anchors;
}

// --- §3 "Состояние линии" --------------------------------------------------

/** Rule 18: coalesce a line's cells into runs. Empty (or inactive, always empty) cells close a run. */
export function computeRuns(cells: readonly Cell[]): Run[] {
  const runs: Run[] = [];
  let current: { color: ColorId; count: number } | null = null;

  for (const cell of cells) {
    if (cell === null) {
      if (current !== null) runs.push(current);
      current = null;
      continue;
    }
    if (current !== null && current.color === cell.color) {
      current = { color: cell.color, count: current.count + 1 };
    } else {
      if (current !== null) runs.push(current);
      current = { color: cell.color, count: 1 };
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}

function runsEqual(a: readonly Run[], b: readonly Run[]): boolean {
  return a.length === b.length && a.every((run, i) => run.color === b[i]?.color && run.count === b[i]?.count);
}

/**
 * Rule 25 (an authoring invariant, checked here defensively): a valid hint
 * never names the same colour twice, so "the declared length for a colour" is
 * well-defined without needing position matching.
 */
function hintCountFor(hint: LineHint, color: ColorId): number | null {
  const run = hint.find((r) => r.color === color);
  return run === undefined ? null : run.count;
}

/** Rule 19–24: ok / wrong / pending for one line. */
export function lineStatusFor(cells: readonly Cell[], hint: LineHint): LineStatus {
  const actual = computeRuns(cells);

  if (runsEqual(actual, hint)) return 'ok';

  // (г) — a colour forming more than one run in this line.
  const colorCounts = new Map<ColorId, number>();
  for (const run of actual) colorCounts.set(run.color, (colorCounts.get(run.color) ?? 0) + 1);
  if ([...colorCounts.values()].some((count) => count > 1)) return 'wrong';

  // (б) — a colour with no run in the hint at all.
  // (в) — a colour's run longer than the hint declares for it.
  for (const run of actual) {
    const declared = hintCountFor(hint, run.color);
    if (declared === null) return 'wrong';
    if (run.count > declared) return 'wrong';
  }

  // (а) — fully filled but still not a match.
  const noEmptyActiveCells = cells.every((cell) => cell !== null);
  if (noEmptyActiveCells) return 'wrong';

  return 'pending';
}

function recomputeLineStatus(
  grid: readonly (readonly Cell[])[],
  rowHints: readonly LineHint[],
  colHints: readonly LineHint[],
): LevelState['lineStatus'] {
  return {
    rows: grid.map((row, i) => lineStatusFor(row, rowHints[i] ?? [])),
    cols: Array.from({ length: GRID_SIZE }, (_, c) => lineStatusFor(column(grid, c), colHints[c] ?? [])),
  };
}

// --- §3 "Тупик" -------------------------------------------------------------

function computeIsStuck(
  grid: readonly (readonly Cell[])[],
  activeCells: readonly (readonly boolean[])[],
  tray: readonly (Piece | null)[],
): boolean {
  return tray.every((piece) => piece === null || validAnchorsForPiece(grid, activeCells, piece).length === 0);
}

// --- §3 "Добор трея" ---------------------------------------------------------

/**
 * Replays a level's placements from a blank board to derive {grid, tray,
 * nextPieceIndex}. Shared by create() (zero moves) and by Undo, which
 * recomputes from `history` with the last move dropped rather than trying to
 * hand-invert a placement that may have triggered a refill (§3 "Добор трея":
 * refill happens only once all three slots are spent, so undoing the move
 * that spent the last slot must also un-consume the batch it pulled in — a
 * direct inverse would need to special-case that; replaying from scratch
 * makes it fall out for free and is trivially correct by construction).
 */
function replay(
  trayPieces: readonly Piece[],
  moves: readonly PlacedMove[],
): { grid: Cell[][]; tray: (Piece | null)[]; nextPieceIndex: number } {
  const grid = emptyGrid();
  let tray: (Piece | null)[] = trayPieces.slice(0, TRAY_SIZE);
  while (tray.length < TRAY_SIZE) tray.push(null);
  let nextPieceIndex = Math.min(TRAY_SIZE, trayPieces.length);

  for (const move of moves) {
    for (const cell of move.cells) {
      const row = grid[cell.row];
      if (row === undefined) throw new Error(`History move targets out-of-range row ${String(cell.row)}.`);
      row[cell.col] = { color: cell.color };
    }
    tray = tray.map((piece, slot) => (slot === move.traySlot ? null : piece));

    if (tray.every((piece) => piece === null)) {
      const batch = trayPieces.slice(nextPieceIndex, nextPieceIndex + TRAY_SIZE);
      tray = Array.from({ length: TRAY_SIZE }, (_, i) => batch[i] ?? null);
      nextPieceIndex += batch.length;
    }
  }

  return { grid, tray, nextPieceIndex };
}

// --- Public engine -----------------------------------------------------

function finish(
  level: Pick<LevelConfig, 'rowHints' | 'colHints'>,
  activeCells: readonly (readonly boolean[])[],
  grid: readonly (readonly Cell[])[],
  tray: readonly (Piece | null)[],
  rest: Omit<
    LevelState,
    'grid' | 'lineStatus' | 'gameState' | 'isStuck' | 'tray' | 'activeCells' | 'rowHints' | 'colHints'
  >,
): LevelState {
  const lineStatus = recomputeLineStatus(grid, level.rowHints, level.colHints);
  const gameState = lineStatus.rows.every((s) => s === 'ok') && lineStatus.cols.every((s) => s === 'ok')
    ? 'won'
    : 'playing';

  return {
    ...rest,
    grid,
    activeCells,
    rowHints: level.rowHints,
    colHints: level.colHints,
    tray,
    lineStatus,
    gameState,
    isStuck: gameState === 'won' ? false : computeIsStuck(grid, activeCells, tray),
  };
}

export const pixelDropEngine: MechanicEngine<LevelState, GameInput, LevelConfig> = {
  create(level: LevelConfig): LevelState {
    const activeCells = activeCellsGrid(level.activeCells);
    const { grid, tray, nextPieceIndex } = replay(level.trayPieces, []);

    return finish(level, activeCells, grid, tray, {
      trayPieces: level.trayPieces,
      nextPieceIndex,
      selectedPieceIdx: null,
      history: [],
      undoBudget: level.undoBudget,
    });
  },

  apply(state: LevelState, input: GameInput): LevelState {
    // Rule "При gameState = 'won' весь дальнейший ввод игнорируется".
    if (state.gameState === 'won') return state;

    switch (input.type) {
      case 'tap_piece': {
        // Rule 9: tap on an empty slot does nothing.
        if (state.tray[input.traySlot] === undefined || state.tray[input.traySlot] === null) return state;
        // Rules 6–8: select this slot (idempotent if already selected).
        return { ...state, selectedPieceIdx: input.traySlot };
      }

      case 'tap_background': {
        // Rule 10.
        if (state.selectedPieceIdx === null) return state;
        return { ...state, selectedPieceIdx: null };
      }

      case 'tap_cell': {
        // Rule 11: no selection, no effect.
        if (state.selectedPieceIdx === null) return state;
        const piece = state.tray[state.selectedPieceIdx];
        if (piece === undefined || piece === null) return state;

        const targets = computeTargetCells(input.row, input.col, piece);
        // Rules 14–15: any out-of-bounds/inactive/occupied cell voids the whole placement.
        if (!isValidPlacement(state.grid, state.activeCells, targets)) return state;

        const grid = state.grid.map((row) => row.slice());
        for (const target of targets) {
          const row = grid[target.row];
          if (row === undefined) throw new Error('Validated placement landed out of range.');
          row[target.col] = { color: target.color };
        }

        const move: PlacedMove = {
          pieceId: piece.id,
          traySlot: state.selectedPieceIdx,
          cells: targets,
        };
        const history = [...state.history, move];

        let tray = state.tray.map((slot, i) => (i === state.selectedPieceIdx ? null : slot));
        let nextPieceIndex = state.nextPieceIndex;
        // Rules 26–28: refill only once every slot is spent.
        if (tray.every((slot) => slot === null)) {
          const batch = state.trayPieces.slice(nextPieceIndex, nextPieceIndex + TRAY_SIZE);
          tray = Array.from({ length: TRAY_SIZE }, (_, i) => batch[i] ?? null);
          nextPieceIndex += batch.length;
        }

        return finish({ rowHints: state.rowHints, colHints: state.colHints }, state.activeCells, grid, tray, {
          trayPieces: state.trayPieces,
          nextPieceIndex,
          selectedPieceIdx: null,
          history,
          undoBudget: state.undoBudget,
        });
      }

      case 'tap_undo': {
        // Rules 33–34.
        if (state.history.length === 0) return state;
        if (state.undoBudget === 0) return state;

        const history = state.history.slice(0, -1);
        const { grid, tray, nextPieceIndex } = replay(state.trayPieces, history);

        return finish({ rowHints: state.rowHints, colHints: state.colHints }, state.activeCells, grid, tray, {
          trayPieces: state.trayPieces,
          nextPieceIndex,
          selectedPieceIdx: null,
          history,
          undoBudget: state.undoBudget - 1,
        });
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};

/** Exposed for the level authoring solver (docs/rules.md §6) and for the renderer's own use. */
export const pixelDropInternals = {
  emptyGrid,
  activeCellsGrid,
  column,
};
