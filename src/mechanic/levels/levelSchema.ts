import { GRID_SIZE, TRAY_SIZE, type ColorId, type LevelConfig, type Piece, type PieceCell } from '../engine/types.ts';

export const LEVELS_SCHEMA_VERSION = 3;
const COLOR_IDS: readonly ColorId[] = ['coral', 'rose', 'purple'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isColorId(value: unknown): value is ColorId {
  return typeof value === 'string' && (COLOR_IDS as readonly string[]).includes(value);
}

function requiredText(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(where + '.' + key + ' must be a non-empty string.');
  }
  return value;
}

function parseTarget(value: unknown, where: string): readonly (readonly (ColorId | null)[])[] {
  if (!Array.isArray(value) || value.length !== GRID_SIZE) {
    throw new Error(where + ' must contain exactly ' + String(GRID_SIZE) + ' rows.');
  }

  return (value as unknown[]).map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== GRID_SIZE) {
      throw new Error(where + '[' + String(rowIndex) + '] must contain exactly ' + String(GRID_SIZE) + ' cells.');
    }

    return (row as unknown[]).map((color, colIndex): ColorId | null => {
      if (color !== null && !isColorId(color)) {
        throw new Error(where + '[' + String(rowIndex) + '][' + String(colIndex) + '] has an unknown color.');
      }
      return color;
    });
  });
}

function parsePieceCell(value: unknown, where: string): PieceCell {
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  const offset = value['offset'];
  const color = value['color'];

  if (
    !Array.isArray(offset) ||
    offset.length !== 2 ||
    typeof offset[0] !== 'number' ||
    typeof offset[1] !== 'number' ||
    !Number.isInteger(offset[0]) ||
    !Number.isInteger(offset[1]) ||
    offset[0] < 0 ||
    offset[1] < 0 ||
    offset[0] >= GRID_SIZE ||
    offset[1] >= GRID_SIZE
  ) {
    throw new Error(where + '.offset must be an in-board non-negative integer [row, col] pair.');
  }
  if (!isColorId(color)) throw new Error(where + '.color has an unknown value.');
  return { offset: [offset[0], offset[1]], color };
}

function parsePiece(value: unknown, where: string): Piece {
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  const id = requiredText(value, 'id', where);
  const label = requiredText(value, 'label', where);
  const cells = value['cells'];
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 5) {
    throw new Error(where + '.cells must contain between 1 and 5 cells.');
  }

  const parsedCells = (cells as unknown[]).map((cell, index) =>
    parsePieceCell(cell, where + '.cells[' + String(index) + ']'),
  );
  const offsets = parsedCells.map((cell) => cell.offset.join(','));
  if (new Set(offsets).size !== offsets.length) throw new Error(where + '.cells contains duplicate offsets.');
  return { id, label, cells: parsedCells };
}

function parsePieceSet(value: unknown, where: string): readonly Piece[] {
  if (!Array.isArray(value) || value.length !== TRAY_SIZE) {
    throw new Error(where + ' must contain exactly ' + String(TRAY_SIZE) + ' pieces.');
  }

  const pieces = (value as unknown[]).map((piece, index) => parsePiece(piece, where + '[' + String(index) + ']'));
  if (new Set(pieces.map((piece) => piece.id)).size !== pieces.length) {
    throw new Error(where + ' piece ids must be unique.');
  }
  return pieces;
}

function parsePieceSets(value: unknown): ReadonlyMap<string, readonly Piece[]> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error('Level pack must contain at least one piece set.');
  }

  return new Map(
    Object.entries(value).map(([id, pieceSet]) => [id, parsePieceSet(pieceSet, 'pieceSets.' + id)] as const),
  );
}

function countColor(colors: readonly (ColorId | null)[], color: ColorId): number {
  return colors.filter((item) => item === color).length;
}

function checkColorInventory(target: LevelConfig['target'], pieces: readonly Piece[], where: string): void {
  const targetColors = target.flat();
  const pieceColors = pieces.flatMap((piece) => piece.cells.map((cell) => cell.color));
  for (const color of COLOR_IDS) {
    if (countColor(targetColors, color) !== countColor(pieceColors, color)) {
      throw new Error(where + ' target and pieces must contain the same number of ' + color + ' cells.');
    }
  }
}

interface CandidatePlacement {
  readonly cells: readonly (readonly [number, number])[];
}

function candidatePlacements(piece: Piece, target: LevelConfig['target']): CandidatePlacement[] {
  const candidates: CandidatePlacement[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const cells = piece.cells.map((cell) => [row + cell.offset[0], col + cell.offset[1]] as const);
      const matches = cells.every(([targetRow, targetCol], index) => {
        const pieceCell = piece.cells[index];
        return pieceCell !== undefined && target[targetRow]?.[targetCol] === pieceCell.color;
      });
      if (matches) candidates.push({ cells });
    }
  }
  return candidates;
}

function canTileTarget(target: LevelConfig['target'], pieces: readonly Piece[]): boolean {
  const candidates = pieces
    .map((piece) => ({ piece, placements: candidatePlacements(piece, target) }))
    .sort((a, b) => a.placements.length - b.placements.length);
  if (candidates.some((entry) => entry.placements.length === 0)) return false;

  const occupied = new Set<string>();
  const search = (index: number): boolean => {
    const entry = candidates[index];
    if (entry === undefined) return true;

    for (const placement of entry.placements) {
      const keys = placement.cells.map(([row, col]) => String(row) + ',' + String(col));
      if (keys.some((key) => occupied.has(key))) continue;
      keys.forEach((key) => occupied.add(key));
      if (search(index + 1)) return true;
      keys.forEach((key) => occupied.delete(key));
    }
    return false;
  };

  return search(0);
}

function parseLevel(
  value: unknown,
  index: number,
  pieceSets: ReadonlyMap<string, readonly Piece[]>,
): LevelConfig {
  const where = 'levels[' + String(index) + ']';
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  if (value['id'] !== index + 1) throw new Error(where + '.id must be ' + String(index + 1) + '.');
  if (value['gridSize'] !== GRID_SIZE) throw new Error(where + '.gridSize must be ' + String(GRID_SIZE) + '.');

  const pieceSetId = requiredText(value, 'pieceSet', where);
  const pieceSet = pieceSets.get(pieceSetId);
  if (pieceSet === undefined) throw new Error(where + '.pieceSet references unknown set ' + pieceSetId + '.');
  const target = parseTarget(value['target'], where + '.target');
  checkColorInventory(target, pieceSet, where);
  if (!canTileTarget(target, pieceSet)) throw new Error(where + ' cannot be tiled by its configured pieces.');

  return {
    id: index + 1,
    gridSize: GRID_SIZE,
    title: requiredText(value, 'title', where),
    instruction: requiredText(value, 'instruction', where),
    sampleAlt: requiredText(value, 'sampleAlt', where),
    target,
    pieces: pieceSet.map((piece) => ({ ...piece, id: 'l' + String(index + 1) + '-' + piece.id })),
  };
}

export function parseLevelPack(raw: unknown, expectedLevelCount: number): LevelConfig[] {
  if (!isRecord(raw)) throw new Error('Level pack must be an object.');
  if (raw['schemaVersion'] !== LEVELS_SCHEMA_VERSION) {
    throw new Error('Level pack schemaVersion must be ' + String(LEVELS_SCHEMA_VERSION) + '.');
  }

  const pieceSets = parsePieceSets(raw['pieceSets']);
  const levels = raw['levels'];
  if (!Array.isArray(levels) || levels.length !== expectedLevelCount) {
    throw new Error('Level pack must contain exactly ' + String(expectedLevelCount) + ' levels.');
  }

  return (levels as unknown[]).map((level, index) => parseLevel(level, index, pieceSets));
}
