import type {
  Cell,
  ColorId,
  GameInput,
  LevelConfig,
  LevelState,
  MechanicEngine,
  Piece,
  PieceCell,
  Placement,
} from './types.ts';

/**
 * Pixel Drop v2's rules, straight from docs/rules.md. Every exported function
 * below is named after the section it implements so the mapping stays
 * traceable; the section numbers in comments are docs/rules.md's own.
 */

// --- Board shape --------------------------------------------------------

function emptyGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function inBounds(rows: number, cols: number, row: number, col: number): boolean {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

// --- §3 "Проверка размещения": target cells and validity --------------------

export interface TargetCell {
  readonly row: number;
  readonly col: number;
  readonly color: ColorId;
}

/** Every piece cell's absolute position given an anchor — docs/rules.md §3 "Фигуры" rule 4. */
export function computeTargetCells(anchorRow: number, anchorCol: number, piece: Piece): TargetCell[] {
  return piece.cells.map((cell: PieceCell) => ({
    row: anchorRow + cell.offset[0],
    col: anchorCol + cell.offset[1],
    color: cell.color,
  }));
}

/**
 * Rule "не пересекаются с клетками любой другой уже размещённой фигуры": a
 * piece's own current placement is never an obstacle for itself, which is why
 * this takes the placements of every *other* piece rather than a grid.
 */
export function isValidPlacement(
  rows: number,
  cols: number,
  pieces: readonly Piece[],
  placements: Readonly<Record<string, Placement>>,
  pieceId: string,
  anchorRow: number,
  anchorCol: number,
): boolean {
  const piece = pieces.find((p) => p.id === pieceId);
  if (piece === undefined) return false;

  const targets = computeTargetCells(anchorRow, anchorCol, piece);
  if (!targets.every((t) => inBounds(rows, cols, t.row, t.col))) return false;

  const occupied = new Set<string>();
  for (const other of pieces) {
    if (other.id === pieceId) continue;
    const placement = placements[other.id];
    if (placement === undefined || placement === null) continue;
    for (const cell of computeTargetCells(placement.row, placement.col, other)) {
      occupied.add(`${String(cell.row)},${String(cell.col)}`);
    }
  }

  return targets.every((t) => !occupied.has(`${String(t.row)},${String(t.col)}`));
}

/** Rebuilds the board from placements — the only source of truth (docs/rules.md §4). */
export function buildGrid(
  rows: number,
  cols: number,
  pieces: readonly Piece[],
  placements: Readonly<Record<string, Placement>>,
): Cell[][] {
  const grid = emptyGrid(rows, cols);
  for (const piece of pieces) {
    const placement = placements[piece.id];
    if (placement === undefined || placement === null) continue;
    for (const cell of computeTargetCells(placement.row, placement.col, piece)) {
      const row = grid[cell.row];
      if (row === undefined) throw new Error('Validated placement landed out of range.');
      row[cell.col] = { color: cell.color };
    }
  }
  return grid;
}

export function gridsEqual(a: readonly (readonly Cell[])[], b: readonly (readonly Cell[])[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, r) => {
    const other = b[r];
    if (other === undefined || row.length !== other.length) return false;
    return row.every((cell, c) => {
      const otherCell = other[c];
      if (otherCell === undefined) return false;
      if (cell === null || otherCell === null) return cell === otherCell;
      return cell.color === otherCell.color;
    });
  });
}

// --- Public engine -----------------------------------------------------

function finish(
  level: Pick<LevelConfig, 'rows' | 'cols' | 'targetGrid' | 'pieces'>,
  placements: Readonly<Record<string, Placement>>,
): LevelState {
  const grid = buildGrid(level.rows, level.cols, level.pieces, placements);
  const everyPiecePlaced = level.pieces.every((p) => placements[p.id] !== undefined && placements[p.id] !== null);
  const gameState = everyPiecePlaced && gridsEqual(grid, level.targetGrid) ? 'won' : 'playing';

  return {
    gameState,
    rows: level.rows,
    cols: level.cols,
    targetGrid: level.targetGrid,
    pieces: level.pieces,
    placements,
    grid,
  };
}

export const pixelDropEngine: MechanicEngine<LevelState, GameInput, LevelConfig> = {
  create(level: LevelConfig): LevelState {
    const placements: Record<string, Placement> = {};
    for (const piece of level.pieces) placements[piece.id] = null;
    return finish(level, placements);
  },

  apply(state: LevelState, input: GameInput): LevelState {
    // Rule "При gameState = 'won' дальнейший ввод игнорируется" (§3 "Победа").
    if (state.gameState === 'won') return state;

    switch (input.type) {
      case 'unplace': {
        const current = state.placements[input.pieceId];
        if (current === undefined || current === null) return state;
        return finish(state, { ...state.placements, [input.pieceId]: null });
      }

      case 'place': {
        if (!state.pieces.some((p) => p.id === input.pieceId)) return state;
        if (
          !isValidPlacement(
            state.rows,
            state.cols,
            state.pieces,
            state.placements,
            input.pieceId,
            input.anchorRow,
            input.anchorCol,
          )
        ) {
          return state;
        }

        return finish(state, {
          ...state.placements,
          [input.pieceId]: { row: input.anchorRow, col: input.anchorCol },
        });
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};

/**
 * Folds a saved (or authored) placement map into a fresh level — used both to
 * restore an autosave (docs/rules.md §9) and to replay solutionPlacements in
 * tests. Placements for unknown pieces are ignored; a placement that is no
 * longer valid (e.g. a corrupt or stale save) is silently skipped, leaving
 * that piece in the tray rather than failing the whole restore.
 */
export function restoreFromPlacements(
  level: LevelConfig,
  saved: Readonly<Record<string, { readonly row: number; readonly col: number }>>,
): LevelState {
  let state = pixelDropEngine.create(level);
  for (const piece of level.pieces) {
    const placement = saved[piece.id];
    if (placement === undefined) continue;
    state = pixelDropEngine.apply(state, {
      type: 'place',
      pieceId: piece.id,
      anchorRow: placement.row,
      anchorCol: placement.col,
    });
  }
  return state;
}
