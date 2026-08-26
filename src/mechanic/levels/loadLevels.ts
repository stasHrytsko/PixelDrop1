import { GAME } from '../../game.config.ts';
import { GRID_SIZE } from '../engine/types.ts';
import type { ColorId, LevelConfig, LineHint, Piece, PieceCell } from '../engine/types.ts';
import rawLevelPack from './levels.json';

export const LEVELS_SCHEMA_VERSION = 1;

const COLOR_IDS: readonly ColorId[] = ['red', 'blue', 'green', 'yellow', 'purple'];
const ONBOARDING_STEPS = ['runs', 'forcing', 'intersection', 'repeated_color', 'multicolor'] as const;

function isColorId(value: unknown): value is ColorId {
  return typeof value === 'string' && (COLOR_IDS as readonly string[]).includes(value);
}

/**
 * Levels are data, and data from a file is untrusted until it is checked —
 * this is the one place in the mechanic where `unknown` is the correct type.
 * Everything downstream gets a fully narrowed `LevelConfig`.
 *
 * This checks shape, not solvability: whether a level's rowHints/colHints are
 * jointly satisfiable by its trayPieces is an authoring-time question, worked
 * out by the solver described in docs/rules.md §6 — it does not run here.
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
  if (level['gridSize'] !== GRID_SIZE) {
    throw new Error(`${where}.gridSize must be ${String(GRID_SIZE)}, got ${String(level['gridSize'])}.`);
  }

  const activeCells = parseActiveCells(level['activeCells'], `${where}.activeCells`);
  const rowHints = parseLineHints(level['rowHints'], `${where}.rowHints`);
  const colHints = parseLineHints(level['colHints'], `${where}.colHints`);
  const trayPieces = parseTrayPieces(level['trayPieces'], `${where}.trayPieces`);

  const undoBudget = level['undoBudget'];
  if (typeof undoBudget !== 'number' || !Number.isInteger(undoBudget) || undoBudget < 0) {
    throw new Error(`${where}.undoBudget must be a non-negative integer, got ${String(undoBudget)}.`);
  }

  const onboardingStep = level['onboardingStep'];
  if (onboardingStep !== null && !(ONBOARDING_STEPS as readonly unknown[]).includes(onboardingStep)) {
    throw new Error(
      `${where}.onboardingStep must be one of ${JSON.stringify(ONBOARDING_STEPS)} or null, got ${JSON.stringify(onboardingStep)}.`,
    );
  }

  checkActiveCellsIsRectangle(activeCells, where);
  checkNoColorRepeatsInAnyHint(rowHints, `${where}.rowHints`);
  checkNoColorRepeatsInAnyHint(colHints, `${where}.colHints`);

  return {
    id: index + 1,
    gridSize: GRID_SIZE,
    activeCells,
    rowHints,
    colHints,
    trayPieces,
    undoBudget,
    onboardingStep: onboardingStep as LevelConfig['onboardingStep'],
  };
}

function parseCoord(value: unknown, where: string): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isInteger(value[0]) ||
    !Number.isInteger(value[1])
  ) {
    throw new Error(`${where} must be a [row, col] pair of integers, got ${JSON.stringify(value)}.`);
  }
  if (value[0] < 0 || value[0] >= GRID_SIZE || value[1] < 0 || value[1] >= GRID_SIZE) {
    throw new Error(`${where} must be within 0..${String(GRID_SIZE - 1)}, got ${JSON.stringify(value)}.`);
  }
  return [value[0], value[1]];
}

function parseActiveCells(value: unknown, where: string): readonly (readonly [number, number])[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where} must be a non-empty array of [row, col] pairs.`);
  }
  const seen = new Set<string>();
  return value.map((entry, i) => {
    const coord = parseCoord(entry, `${where}[${String(i)}]`);
    const key = `${String(coord[0])},${String(coord[1])}`;
    if (seen.has(key)) throw new Error(`${where}[${String(i)}] duplicates an earlier cell: ${key}.`);
    seen.add(key);
    return coord;
  });
}

/** docs/rules.md §6: "активная область должна быть прямоугольником". */
function checkActiveCellsIsRectangle(cells: readonly (readonly [number, number])[], where: string): void {
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const expectedCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);

  if (cells.length !== expectedCount) {
    throw new Error(
      `${where}.activeCells must form a solid rectangle: bounding box ` +
        `rows ${String(minRow)}-${String(maxRow)} × cols ${String(minCol)}-${String(maxCol)} ` +
        `needs ${String(expectedCount)} cells, got ${String(cells.length)}.`,
    );
  }
}

function parseRun(value: unknown, where: string): { count: number; color: ColorId } {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object.`);
  }
  const run = value as Record<string, unknown>;
  const count = run['count'];
  const color = run['color'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    throw new Error(`${where}.count must be a positive integer, got ${String(count)}.`);
  }
  if (!isColorId(color)) {
    throw new Error(`${where}.color must be one of ${JSON.stringify(COLOR_IDS)}, got ${String(color)}.`);
  }
  return { count, color };
}

function parseLineHints(value: unknown, where: string): readonly LineHint[] {
  if (!Array.isArray(value) || value.length !== GRID_SIZE) {
    throw new Error(`${where} must be an array of exactly ${String(GRID_SIZE)} line hints.`);
  }
  return value.map((line, i) => {
    const lineWhere = `${where}[${String(i)}]`;
    if (!Array.isArray(line)) throw new Error(`${lineWhere} must be an array of runs.`);
    return line.map((run, j) => parseRun(run, `${lineWhere}[${String(j)}]`));
  });
}

/** docs/rules.md §3 rule 25: one colour forms at most one run per line — an authoring invariant. */
function checkNoColorRepeatsInAnyHint(hints: readonly LineHint[], where: string): void {
  hints.forEach((hint, i) => {
    const colors = hint.map((run) => run.color);
    if (new Set(colors).size !== colors.length) {
      throw new Error(`${where}[${String(i)}] names the same colour in two runs: ${JSON.stringify(colors)}.`);
    }
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
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 5) {
    throw new Error(`${where}.cells must have between 1 and 5 cells (docs/rules.md §3 rule 3).`);
  }
  const parsedCells = cells.map((cell, i) => parsePieceCell(cell, `${where}.cells[${String(i)}]`));

  const anchor = parsedCells[0];
  if (anchor === undefined || anchor.offset[0] !== 0 || anchor.offset[1] !== 0) {
    throw new Error(`${where}.cells[0] must be the anchor cell with offset [0, 0] (docs/rules.md §3 rule 4).`);
  }

  return { id, cells: parsedCells };
}

function parseTrayPieces(value: unknown, where: string): readonly Piece[] {
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

/** Validated at module load: a broken level pack must fail loudly and early. */
export const LEVELS: readonly LevelConfig[] = parseLevelPack(rawLevelPack, GAME.levelCount);

export function getLevel(levelIndex: number): LevelConfig {
  const level = LEVELS[levelIndex];
  if (level === undefined) {
    throw new Error(`No level at index ${String(levelIndex)} (pack has ${String(LEVELS.length)}).`);
  }
  return level;
}
