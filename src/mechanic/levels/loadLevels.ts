import { GAME } from '../../game.config.ts';
import type { Cell, ColorId, LevelConfig, Piece, PieceCell } from '../engine/types.ts';
import rawLevelPack from './levels.json';

export const LEVELS_SCHEMA_VERSION = 2;

const COLOR_IDS: readonly ColorId[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'];
const PIECE_CELL_COUNT = 4;

function isColorId(value: unknown): value is ColorId {
  return typeof value === 'string' && (COLOR_IDS as readonly string[]).includes(value);
}

/**
 * Levels are data, and data from a file is untrusted until it is checked —
 * this is the one place in the mechanic where `unknown` is the correct type.
 * Everything downstream gets a fully narrowed `LevelConfig`.
 *
 * This checks shape, not solvability: whether solutionPlacements actually
 * reaches `targetGrid` through the engine is an authoring-time question,
 * worked out by tests/mechanic/levels.test.ts (docs/rules.md §6) — it does
 * not run here.
 *
 * Validation throws rather than repairing: a level pack that does not match
 * the game is a bug to fix at build time, not a condition to survive at
 * runtime.
 */
export function parseLevelPack(raw: unknown, expectedLevelCount: number): LevelConfig[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Level pack must be an object.');
  }
  const pack = raw as Record<string, unknown>;

  if (pack['schemaVersion'] !== LEVELS_SCHEMA_VERSION) {
    throw new Error(
      `Level pack schemaVersion must be ${String(LEVELS_SCHEMA_VERSION)}, got ${String(pack['schemaVersion'])}.`,
    );
  }

  const levels = pack['levels'];
  if (!Array.isArray(levels)) {
    throw new Error('Level pack must have a "levels" array.');
  }
  if (levels.length !== expectedLevelCount) {
    throw new Error(
      `Level pack has ${String(levels.length)} levels but GameDefinition.levelCount is ${String(expectedLevelCount)}.`,
    );
  }

  return levels.map((entry, index) => parseLevel(entry, index));
}

function parseLevel(entry: unknown, index: number): LevelConfig {
  const where = `levels[${String(index)}]`;
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${where} must be an object.`);
  }
  const level = entry as Record<string, unknown>;

  if (level['id'] !== index + 1) {
    throw new Error(`${where}.id must be ${String(index + 1)}, got ${String(level['id'])}.`);
  }

  const version = level['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`${where}.version must be a positive integer, got ${String(version)}.`);
  }

  const rows = parseDimension(level['rows'], `${where}.rows`);
  const cols = parseDimension(level['cols'], `${where}.cols`);
  const palette = parsePalette(level['palette'], `${where}.palette`);
  const targetGrid = parseGrid(level['targetGrid'], rows, cols, `${where}.targetGrid`);
  const pieces = parsePieces(level['pieces'], `${where}.pieces`);
  const solutionPlacements = parseSolutionPlacements(level['solutionPlacements'], pieces, rows, cols, `${where}.solutionPlacements`);

  checkPaletteCoversPieces(palette, pieces, where);
  checkFilledCellCountMatchesPieces(targetGrid, pieces, where);

  return { id: index + 1, version, rows, cols, palette, targetGrid, pieces, solutionPlacements };
}

function parseDimension(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${where} must be a positive integer, got ${String(value)}.`);
  }
  return value;
}

function parsePalette(value: unknown, where: string): readonly ColorId[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where} must be a non-empty array of colours.`);
  }
  return value.map((entry, i) => {
    if (!isColorId(entry)) {
      throw new Error(`${where}[${String(i)}] must be one of ${JSON.stringify(COLOR_IDS)}, got ${String(entry)}.`);
    }
    return entry;
  });
}

function parseCell(value: unknown, where: string): Cell {
  if (value === null) return null;
  if (typeof value !== 'object') {
    throw new Error(`${where} must be null or { color }, got ${JSON.stringify(value)}.`);
  }
  const cell = value as Record<string, unknown>;
  const color = cell['color'];
  if (!isColorId(color)) {
    throw new Error(`${where}.color must be one of ${JSON.stringify(COLOR_IDS)}, got ${String(color)}.`);
  }
  return { color };
}

function parseGrid(value: unknown, rows: number, cols: number, where: string): readonly (readonly Cell[])[] {
  if (!Array.isArray(value) || value.length !== rows) {
    throw new Error(`${where} must be an array of exactly ${String(rows)} rows.`);
  }
  return value.map((row, r) => {
    const rowWhere = `${where}[${String(r)}]`;
    if (!Array.isArray(row) || row.length !== cols) {
      throw new Error(`${rowWhere} must be an array of exactly ${String(cols)} cells.`);
    }
    return row.map((cell, c) => parseCell(cell, `${rowWhere}[${String(c)}]`));
  });
}

function parsePieceCell(value: unknown, where: string): PieceCell {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object.`);
  }
  const cell = value as Record<string, unknown>;
  const offset = cell['offset'];
  if (
    !Array.isArray(offset) ||
    offset.length !== 2 ||
    typeof offset[0] !== 'number' ||
    typeof offset[1] !== 'number' ||
    !Number.isInteger(offset[0]) ||
    !Number.isInteger(offset[1])
  ) {
    throw new Error(`${where}.offset must be a [row, col] pair of integers, got ${JSON.stringify(offset)}.`);
  }
  const color = cell['color'];
  if (!isColorId(color)) {
    throw new Error(`${where}.color must be one of ${JSON.stringify(COLOR_IDS)}, got ${String(color)}.`);
  }
  return { offset: [offset[0], offset[1]], color };
}

/** docs/rules.md §3 "Фигуры" rule 1: four cells, connected side-to-side (4-neighbour). */
function checkTetrominoConnectivity(cells: readonly PieceCell[], where: string): void {
  const key = (r: number, c: number): string => `${String(r)},${String(c)}`;
  const positions = new Set(cells.map((cell) => key(cell.offset[0], cell.offset[1])));
  if (positions.size !== cells.length) {
    throw new Error(`${where}.cells must not repeat the same offset (docs/rules.md §3 "Фигуры").`);
  }

  const visited = new Set<string>();
  const start = cells[0];
  if (start === undefined) throw new Error(`${where}.cells must not be empty.`);
  const queue: [number, number][] = [[start.offset[0], start.offset[1]]];
  visited.add(key(start.offset[0], start.offset[1]));

  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined) break;
    const [r, c] = next;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const neighbourKey = key(r + dr, c + dc);
      if (positions.has(neighbourKey) && !visited.has(neighbourKey)) {
        visited.add(neighbourKey);
        queue.push([r + dr, c + dc]);
      }
    }
  }

  if (visited.size !== cells.length) {
    throw new Error(`${where}.cells must form one connected tetromino (docs/rules.md §3 "Фигуры" rule 1).`);
  }
}

function parsePiece(value: unknown, where: string): Piece {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object.`);
  }
  const piece = value as Record<string, unknown>;
  const id = piece['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${where}.id must be a non-empty string.`);
  }
  const cells = piece['cells'];
  if (!Array.isArray(cells) || cells.length !== PIECE_CELL_COUNT) {
    throw new Error(`${where}.cells must have exactly ${String(PIECE_CELL_COUNT)} cells (docs/rules.md §3 "Фигуры").`);
  }
  const parsedCells = cells.map((cell, i) => parsePieceCell(cell, `${where}.cells[${String(i)}]`));

  const anchor = parsedCells[0];
  if (anchor === undefined || anchor.offset[0] !== 0 || anchor.offset[1] !== 0) {
    throw new Error(`${where}.cells[0] must be the anchor cell with offset [0, 0] (docs/rules.md §3 "Фигуры" rule 4).`);
  }
  checkTetrominoConnectivity(parsedCells, where);

  return { id, cells: parsedCells };
}

function parsePieces(value: unknown, where: string): readonly Piece[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where} must be a non-empty array.`);
  }
  const seenIds = new Set<string>();
  return value.map((entry, i) => {
    const piece = parsePiece(entry, `${where}[${String(i)}]`);
    if (seenIds.has(piece.id)) {
      throw new Error(`${where}[${String(i)}].id ${JSON.stringify(piece.id)} is not unique across the level.`);
    }
    seenIds.add(piece.id);
    return piece;
  });
}

function parseAnchor(value: unknown, rows: number, cols: number, where: string): { row: number; col: number } {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object.`);
  }
  const anchor = value as Record<string, unknown>;
  const row = anchor['row'];
  const col = anchor['col'];
  if (typeof row !== 'number' || typeof col !== 'number' || !Number.isInteger(row) || !Number.isInteger(col)) {
    throw new Error(`${where} must be { row, col } integers, got ${JSON.stringify(value)}.`);
  }
  if (row < 0 || row >= rows || col < 0 || col >= cols) {
    throw new Error(`${where} must be within the board, got ${JSON.stringify(value)}.`);
  }
  return { row, col };
}

/** docs/rules.md §6 authoring check 2: solutionPlacements covers every piece exactly once. */
function parseSolutionPlacements(
  value: unknown,
  pieces: readonly Piece[],
  rows: number,
  cols: number,
  where: string,
): Readonly<Record<string, { row: number; col: number }>> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object.`);
  }
  const raw = value as Record<string, unknown>;
  const result: Record<string, { row: number; col: number }> = {};

  for (const piece of pieces) {
    if (!(piece.id in raw)) {
      throw new Error(`${where} is missing a placement for piece ${JSON.stringify(piece.id)}.`);
    }
    result[piece.id] = parseAnchor(raw[piece.id], rows, cols, `${where}.${piece.id}`);
  }
  if (Object.keys(raw).length !== pieces.length) {
    throw new Error(`${where} must have exactly one entry per piece, got ${String(Object.keys(raw).length)}.`);
  }

  return result;
}

/** docs/rules.md §6 authoring check: palette lists at least every colour a piece actually uses. */
function checkPaletteCoversPieces(palette: readonly ColorId[], pieces: readonly Piece[], where: string): void {
  const declared = new Set(palette);
  for (const piece of pieces) {
    for (const cell of piece.cells) {
      if (!declared.has(cell.color)) {
        throw new Error(`${where}.palette does not list colour ${cell.color} used by piece ${piece.id}.`);
      }
    }
  }
}

/** docs/rules.md §6 authoring check 4: filled cells in targetGrid === 4 × piece count. */
function checkFilledCellCountMatchesPieces(
  targetGrid: readonly (readonly Cell[])[],
  pieces: readonly Piece[],
  where: string,
): void {
  const filled = targetGrid.reduce((sum, row) => sum + row.filter((cell) => cell !== null).length, 0);
  const expected = PIECE_CELL_COUNT * pieces.length;
  if (filled !== expected) {
    throw new Error(
      `${where}.targetGrid has ${String(filled)} filled cells but ${String(pieces.length)} pieces cover ${String(expected)}.`,
    );
  }
}

/** Validated at module load: a broken level pack must fail loudly and early. */
export const LEVELS: readonly LevelConfig[] = parseLevelPack(rawLevelPack, GAME.levelCount);

export function getLevel(levelIndex: number): LevelConfig {
  const level = LEVELS[levelIndex];
  if (level === undefined) {
    throw new Error(`No level at index ${String(levelIndex)} (pack has ${String(LEVELS.length)}).`);
  }
  return level;
}
