import { GAME } from '../../game.config.ts';
import { GRID_SIZE, TRAY_SIZE, type ColorId, type LevelConfig, type Piece, type PieceCell } from '../engine/types.ts';
import rawLevelPack from './levels.json';

export const LEVELS_SCHEMA_VERSION = 2;
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
  const rows = value as unknown[];
  return rows.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== GRID_SIZE) {
      throw new Error(where + '[' + String(rowIndex) + '] must contain exactly ' + String(GRID_SIZE) + ' cells.');
    }
    const cells = row as unknown[];
    return cells.map((color, colIndex): ColorId | null => {
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
    offset[1] < 0
  ) {
    throw new Error(where + '.offset must be a non-negative integer [row, col] pair.');
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
  const parsedCells = (cells as unknown[]).map((cell, index) => parsePieceCell(cell, where + '.cells[' + String(index) + ']'));
  const offsets = parsedCells.map((cell) => cell.offset.join(','));
  if (new Set(offsets).size !== offsets.length) throw new Error(where + '.cells contains duplicate offsets.');
  return { id, label, cells: parsedCells };
}

function parsePieces(value: unknown, where: string): readonly Piece[] {
  if (!Array.isArray(value) || value.length !== TRAY_SIZE) {
    throw new Error(where + ' must contain exactly ' + String(TRAY_SIZE) + ' pieces.');
  }
  const pieces = (value as unknown[]).map((piece, index) => parsePiece(piece, where + '[' + String(index) + ']'));
  if (new Set(pieces.map((piece) => piece.id)).size !== pieces.length) {
    throw new Error(where + ' piece ids must be unique.');
  }
  return pieces;
}

function checkColorInventory(target: LevelConfig['target'], pieces: readonly Piece[], where: string): void {
  const count = (colors: readonly (ColorId | null)[], color: ColorId): number => colors.filter((item) => item === color).length;
  const targetColors = target.flat();
  const pieceColors = pieces.flatMap((piece) => piece.cells.map((cell) => cell.color));
  for (const color of COLOR_IDS) {
    if (count(targetColors, color) !== count(pieceColors, color)) {
      throw new Error(where + ' target and pieces must contain the same number of ' + color + ' cells.');
    }
  }
}

export function parseLevelPack(raw: unknown, expectedLevelCount: number): LevelConfig[] {
  if (!isRecord(raw)) throw new Error('Level pack must be an object.');
  if (raw['schemaVersion'] !== LEVELS_SCHEMA_VERSION) {
    throw new Error('Level pack schemaVersion must be ' + String(LEVELS_SCHEMA_VERSION) + '.');
  }
  const shared = raw['board'];
  if (!isRecord(shared)) throw new Error('Level pack must contain a board object.');
  if (shared['gridSize'] !== GRID_SIZE) throw new Error('board.gridSize must be ' + String(GRID_SIZE) + '.');
  const target = parseTarget(shared['target'], 'board.target');
  const pieces = parsePieces(shared['pieces'], 'board.pieces');
  checkColorInventory(target, pieces, 'board');

  const levels = raw['levels'];
  if (!Array.isArray(levels) || levels.length !== expectedLevelCount) {
    throw new Error('Level pack must contain exactly ' + String(expectedLevelCount) + ' levels.');
  }

  return (levels as unknown[]).map((entry, index) => {
    const where = 'levels[' + String(index) + ']';
    if (!isRecord(entry)) throw new Error(where + ' must be an object.');
    if (entry['id'] !== index + 1) throw new Error(where + '.id must be ' + String(index + 1) + '.');
    return {
      id: index + 1,
      gridSize: GRID_SIZE,
      title: requiredText(entry, 'title', where),
      instruction: requiredText(entry, 'instruction', where),
      sampleAlt: requiredText(entry, 'sampleAlt', where),
      target,
      pieces: pieces.map((piece) => ({ ...piece, id: 'l' + String(index + 1) + '-' + piece.id })),
    };
  });
}

export const LEVELS: readonly LevelConfig[] = parseLevelPack(rawLevelPack, GAME.levelCount);

export function getLevel(levelIndex: number): LevelConfig {
  const level = LEVELS[levelIndex];
  if (level === undefined) throw new Error('No level at index ' + String(levelIndex) + '.');
  return level;
}
