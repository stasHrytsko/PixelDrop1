import {
  GRID_SIZE,
  type Cell,
  type GameInput,
  type LevelConfig,
  type LevelState,
  type MechanicEngine,
  type Piece,
  type Placement,
} from './types.ts';

export interface TargetCell {
  readonly row: number;
  readonly col: number;
  readonly color: Piece['cells'][number]['color'];
  readonly pieceId: string;
}

function emptyGrid(): (Cell | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

function pieceById(pieces: readonly Piece[], pieceId: string): Piece | null {
  return pieces.find((piece) => piece.id === pieceId) ?? null;
}

export function computeTargetCells(row: number, col: number, piece: Piece): TargetCell[] {
  return piece.cells.map((cell) => ({
    row: row + cell.offset[0],
    col: col + cell.offset[1],
    color: cell.color,
    pieceId: piece.id,
  }));
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

export function isValidPlacement(
  grid: readonly (readonly (Cell | null)[])[],
  targets: readonly TargetCell[],
): boolean {
  return targets.every(({ row, col }) => inBounds(row, col) && grid[row]?.[col] === null);
}

function gridForPlacements(pieces: readonly Piece[], placements: readonly Placement[]): (Cell | null)[][] {
  const grid = emptyGrid();

  for (const placement of placements) {
    const piece = pieceById(pieces, placement.pieceId);
    if (piece === null) throw new Error('Placement references unknown piece ' + placement.pieceId + '.');

    const targets = computeTargetCells(placement.row, placement.col, piece);
    if (!isValidPlacement(grid, targets)) {
      throw new Error('Stored placement for ' + placement.pieceId + ' is invalid.');
    }
    for (const target of targets) {
      const gridRow = grid[target.row];
      if (gridRow === undefined) throw new Error('Validated placement landed outside the grid.');
      gridRow[target.col] = { color: target.color, pieceId: target.pieceId };
    }
  }

  return grid;
}

function matchesTarget(
  grid: readonly (readonly (Cell | null)[])[],
  target: readonly (readonly (LevelConfig['target'][number][number])[])[],
): boolean {
  return target.every((row, rowIndex) =>
    row.every((color, colIndex) => (grid[rowIndex]?.[colIndex]?.color ?? null) === color),
  );
}

function finish(
  pieces: readonly Piece[],
  placements: readonly Placement[],
  selectedPieceId: string | null,
  target: LevelConfig['target'],
): LevelState {
  const grid = gridForPlacements(pieces, placements);
  return {
    gameState: matchesTarget(grid, target) ? 'won' : 'playing',
    grid,
    pieces,
    placements,
    selectedPieceId,
    target,
  };
}

export function validAnchorsForPiece(state: LevelState, pieceId: string): { row: number; col: number }[] {
  const piece = pieceById(state.pieces, pieceId);
  if (piece === null) return [];
  const otherPlacements = state.placements.filter((placement) => placement.pieceId !== pieceId);
  const grid = gridForPlacements(state.pieces, otherPlacements);
  const anchors: { row: number; col: number }[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isValidPlacement(grid, computeTargetCells(row, col, piece))) anchors.push({ row, col });
    }
  }
  return anchors;
}

export const pixelDropEngine: MechanicEngine<LevelState, GameInput, LevelConfig> = {
  create(level: LevelConfig): LevelState {
    return finish(level.pieces, [], null, level.target);
  },

  apply(state: LevelState, input: GameInput): LevelState {
    if (state.gameState === 'won') return state;

    switch (input.type) {
      case 'select_piece': {
        if (pieceById(state.pieces, input.pieceId) === null) return state;
        return { ...state, selectedPieceId: input.pieceId };
      }
      case 'clear_selection': {
        if (state.selectedPieceId === null) return state;
        return { ...state, selectedPieceId: null };
      }
      case 'place_piece': {
        const piece = pieceById(state.pieces, input.pieceId);
        if (piece === null) return state;

        const otherPlacements = state.placements.filter((placement) => placement.pieceId !== input.pieceId);
        const gridWithoutPiece = gridForPlacements(state.pieces, otherPlacements);
        if (!isValidPlacement(gridWithoutPiece, computeTargetCells(input.row, input.col, piece))) return state;

        return finish(
          state.pieces,
          [...otherPlacements, { pieceId: input.pieceId, row: input.row, col: input.col }],
          null,
          state.target,
        );
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};

export const pixelDropInternals = { emptyGrid, gridForPlacements, matchesTarget };
