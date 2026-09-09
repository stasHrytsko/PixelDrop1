import {
  GRID_SIZE,
  type Cell,
  type LevelConfig,
  type LevelState,
  type Piece,
  type Placement,
} from './types.ts';

export interface TargetCell {
  readonly row: number;
  readonly col: number;
  readonly color: Piece['cells'][number]['color'];
  readonly pieceId: string;
}

export function createEmptyGrid(): (Cell | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

export function findPiece(pieces: readonly Piece[], pieceId: string): Piece | null {
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

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

export function isValidPlacement(
  grid: readonly (readonly (Cell | null)[])[],
  targets: readonly TargetCell[],
): boolean {
  return targets.every(({ row, col }) => isInsideBoard(row, col) && grid[row]?.[col] === null);
}

export function createGridFromPlacements(
  pieces: readonly Piece[],
  placements: readonly Placement[],
): (Cell | null)[][] {
  const grid = createEmptyGrid();

  for (const placement of placements) {
    const piece = findPiece(pieces, placement.pieceId);
    if (piece === null) throw new Error('Placement references unknown piece ' + placement.pieceId + '.');

    const targets = computeTargetCells(placement.row, placement.col, piece);
    if (!isValidPlacement(grid, targets)) {
      throw new Error('Stored placement for ' + placement.pieceId + ' is invalid.');
    }

    for (const target of targets) {
      const row = grid[target.row];
      if (row === undefined) throw new Error('Validated placement landed outside the grid.');
      row[target.col] = { color: target.color, pieceId: target.pieceId };
    }
  }

  return grid;
}

export function gridMatchesTarget(
  grid: readonly (readonly (Cell | null)[])[],
  target: LevelConfig['target'],
): boolean {
  return target.every((row, rowIndex) =>
    row.every((color, colIndex) => (grid[rowIndex]?.[colIndex]?.color ?? null) === color),
  );
}

export function validAnchorsForPiece(state: LevelState, pieceId: string): { row: number; col: number }[] {
  const piece = findPiece(state.pieces, pieceId);
  if (piece === null) return [];

  const otherPlacements = state.placements.filter((placement) => placement.pieceId !== pieceId);
  const grid = createGridFromPlacements(state.pieces, otherPlacements);
  const anchors: { row: number; col: number }[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (isValidPlacement(grid, computeTargetCells(row, col, piece))) anchors.push({ row, col });
    }
  }

  return anchors;
}
