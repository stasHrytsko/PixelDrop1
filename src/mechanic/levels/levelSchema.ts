import { createGridFromPlacements, gridMatchesTarget } from '../engine/board.ts';
import {
  GRID_SIZE, MAX_PIECE_COUNT, MIN_PIECE_COUNT, PHASE_COUNT,
  type ColorId, type LevelConfig, type LevelPhaseConfig, type Piece,
  type PieceCell, type Placement, type Voxel, type VoxelObjectConfig, type VoxelView,
} from '../engine/types.ts';

export const LEVELS_SCHEMA_VERSION = 6;
const COLOR_IDS: readonly ColorId[] = ['coral', 'rose', 'purple', 'tan', 'brown', 'black', 'white', 'red'];
const VIEWS: readonly VoxelView[] = ['front', 'side', 'bottom'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isColorId(value: unknown): value is ColorId {
  return typeof value === 'string' && (COLOR_IDS as readonly string[]).includes(value);
}
function requiredText(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(where + '.' + key + ' must be a non-empty string.');
  return value;
}
function parseTarget(value: unknown, where: string): LevelPhaseConfig['target'] {
  if (!Array.isArray(value) || value.length !== GRID_SIZE) throw new Error(where + ' must contain exactly 10 rows.');
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== GRID_SIZE) throw new Error(where + '[' + String(rowIndex) + '] must contain exactly 10 cells.');
    return row.map((color, colIndex): ColorId | null => {
      if (color !== null && !isColorId(color)) throw new Error(where + '[' + String(rowIndex) + '][' + String(colIndex) + '] has an unknown color.');
      return color as ColorId;
    });
  });
}
function parsePieceCell(value: unknown, where: string): PieceCell {
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  const offset = value['offset'];
  if (!Array.isArray(offset) || offset.length !== 2 || !Number.isInteger(offset[0]) || !Number.isInteger(offset[1]) ||
      (offset[0] as number) < 0 || (offset[1] as number) < 0 || (offset[0] as number) >= GRID_SIZE || (offset[1] as number) >= GRID_SIZE) {
    throw new Error(where + '.offset must be an in-board non-negative integer [row, col] pair.');
  }
  if (!isColorId(value['color'])) throw new Error(where + '.color has an unknown value.');
  return { offset: [offset[0] as number, offset[1] as number], color: value['color'] };
}
function isConnected(cells: readonly PieceCell[]): boolean {
  const keys = new Set(cells.map((cell) => cell.offset.join(',')));
  const first = cells[0];
  if (first === undefined) return false;
  const seen = new Set<string>([first.offset.join(',')]);
  const queue: Array<readonly [number, number]> = [first.offset];
  while (queue.length > 0) {
    const [row, col] = queue.shift() as readonly [number, number];
    const neighbours: ReadonlyArray<readonly [number, number]> = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
    for (const [nextRow, nextCol] of neighbours) {
      const key = String(nextRow) + ',' + String(nextCol);
      if (keys.has(key) && !seen.has(key)) { seen.add(key); queue.push([nextRow, nextCol]); }
    }
  }
  return seen.size === cells.length;
}
function parsePiece(value: unknown, where: string): Piece {
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  const cells = value['cells'];
  if (!Array.isArray(cells) || cells.length !== 4) throw new Error(where + '.cells must contain exactly 4 cells.');
  const parsed = cells.map((cell, index) => parsePieceCell(cell, where + '.cells[' + String(index) + ']'));
  if (new Set(parsed.map((cell) => cell.offset.join(','))).size !== parsed.length) throw new Error(where + '.cells contains duplicate offsets.');
  if (!isConnected(parsed)) throw new Error(where + '.cells must form one connected tetromino.');
  return { id: requiredText(value, 'id', where), label: requiredText(value, 'label', where), cells: parsed };
}
function parsePieceSet(value: unknown, where: string): readonly Piece[] {
  if (!Array.isArray(value) || value.length < MIN_PIECE_COUNT || value.length > MAX_PIECE_COUNT) {
    throw new Error(where + ' must contain between 1 and 13 pieces.');
  }
  const pieces = value.map((piece, index) => parsePiece(piece, where + '[' + String(index) + ']'));
  if (new Set(pieces.map((piece) => piece.id)).size !== pieces.length) throw new Error(where + ' piece ids must be unique.');
  return pieces;
}
function parsePieceSets(value: unknown): ReadonlyMap<string, readonly Piece[]> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('Level pack must contain at least one piece set.');
  return new Map(Object.entries(value).map(([id, set]) => [id, parsePieceSet(set, 'pieceSets.' + id)] as const));
}
interface PictureDefinition { readonly title: string; readonly instruction: string; readonly sampleAlt: string; readonly target: LevelPhaseConfig['target']; }
function parsePictures(value: unknown): ReadonlyMap<string, PictureDefinition> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('Level pack must contain pictures.');
  return new Map(Object.entries(value).map(([id, raw]) => {
    const where = 'pictures.' + id;
    if (!isRecord(raw)) throw new Error(where + ' must be an object.');
    return [id, { title: requiredText(raw, 'title', where), instruction: requiredText(raw, 'instruction', where), sampleAlt: requiredText(raw, 'sampleAlt', where), target: parseTarget(raw['target'], where + '.target') }] as const;
  }));
}
function parseVoxelObject(id: string, value: unknown): VoxelObjectConfig {
  const where = 'objects.' + id;
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  const size = value['size'];
  if (!Array.isArray(size) || size.length !== 3 || size.some((item) => !Number.isInteger(item) || (item as number) < 1)) throw new Error(where + '.size must be three positive integers.');
  const voxels = value['voxels'];
  if (!Array.isArray(voxels) || voxels.length === 0) throw new Error(where + '.voxels must not be empty.');
  const parsed: Voxel[] = voxels.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(where + '.voxels[' + String(index) + '] must be an object.');
    const { x, y, z, color } = raw;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !isColorId(color)) throw new Error(where + '.voxels[' + String(index) + '] is invalid.');
    if ((x as number) < 0 || (x as number) >= (size[0] as number) || (y as number) < 0 || (y as number) >= (size[1] as number) || (z as number) < 0 || (z as number) >= (size[2] as number)) throw new Error(where + '.voxels[' + String(index) + '] is outside object bounds.');
    return { x: x as number, y: y as number, z: z as number, color };
  });
  if (new Set(parsed.map((voxel) => [voxel.x, voxel.y, voxel.z].join(','))).size !== parsed.length) throw new Error(where + '.voxels contains duplicate coordinates.');
  return { id, label: requiredText(value, 'label', where), size: [size[0] as number, size[1] as number, size[2] as number], voxels: parsed };
}
function parseObjects(value: unknown): ReadonlyMap<string, VoxelObjectConfig> {
  if (!isRecord(value)) throw new Error('Level pack must contain objects.');
  return new Map(Object.entries(value).map(([id, object]) => [id, parseVoxelObject(id, object)] as const));
}
function parseInitialPlacements(value: unknown, pieces: readonly Piece[], where: string): readonly Placement[] {
  if (!Array.isArray(value) || value.length !== pieces.length) throw new Error(where + ' must place exactly ' + String(pieces.length) + ' pieces.');
  const placements = value.map((raw, index): Placement => {
    const itemWhere = where + '[' + String(index) + ']';
    if (!isRecord(raw)) throw new Error(itemWhere + ' must be an object.');
    const pieceId = requiredText(raw, 'pieceId', itemWhere);
    if (!Number.isInteger(raw['row']) || !Number.isInteger(raw['col'])) throw new Error(itemWhere + ' row and col must be integers.');
    return { pieceId, row: raw['row'] as number, col: raw['col'] as number };
  });
  const ids = placements.map((placement) => placement.pieceId);
  const known = new Set(pieces.map((piece) => piece.id));
  if (new Set(ids).size !== pieces.length || ids.some((id) => !known.has(id))) throw new Error(where + ' must place every piece once.');
  return placements;
}
function checkInventory(target: LevelPhaseConfig['target'], pieces: readonly Piece[], where: string): void {
  const targetColors = target.flat();
  const pieceColors = pieces.flatMap((piece) => piece.cells.map((cell) => cell.color));
  for (const color of COLOR_IDS) if (targetColors.filter((item) => item === color).length !== pieceColors.filter((item) => item === color).length) throw new Error(where + ' target and pieces have different color inventory.');
}
function canTileTarget(target: LevelPhaseConfig['target'], pieces: readonly Piece[]): boolean {
  const candidates = pieces.map((piece) => {
    const placements: string[][] = [];
    for (let row = 0; row < GRID_SIZE; row += 1) for (let col = 0; col < GRID_SIZE; col += 1) {
      const cells = piece.cells.map((cell) => [row + cell.offset[0], col + cell.offset[1]] as const);
      if (cells.every(([r, c], index) => target[r]?.[c] === piece.cells[index]?.color)) placements.push(cells.map(([r, c]) => String(r) + ',' + String(c)));
    }
    return placements;
  }).sort((a, b) => a.length - b.length);
  if (candidates.some((entry) => entry.length === 0)) return false;
  const occupied = new Set<string>();
  const search = (index: number): boolean => {
    const entries = candidates[index];
    if (entries === undefined) return true;
    for (const keys of entries) {
      if (keys.some((key) => occupied.has(key))) continue;
      keys.forEach((key) => occupied.add(key));
      if (search(index + 1)) return true;
      keys.forEach((key) => occupied.delete(key));
    }
    return false;
  };
  return search(0);
}
function parseLevel(value: unknown, index: number, sets: ReadonlyMap<string, readonly Piece[]>, pictures: ReadonlyMap<string, PictureDefinition>, objects: ReadonlyMap<string, VoxelObjectConfig>): LevelConfig {
  const where = 'levels[' + String(index) + ']';
  if (!isRecord(value)) throw new Error(where + ' must be an object.');
  if (value['id'] !== index + 1 || value['gridSize'] !== GRID_SIZE) throw new Error(where + ' has invalid id or gridSize.');
  const objectId = value['object'];
  const object = objectId === null || objectId === undefined ? null : objects.get(requiredText(value, 'object', where));
  if (objectId !== null && objectId !== undefined && object === undefined) throw new Error(where + '.object references an unknown object.');
  const rawPhases = value['phases'];
  if (!Array.isArray(rawPhases) || rawPhases.length !== PHASE_COUNT) throw new Error(where + '.phases must contain exactly 3 phases.');
  const phases = rawPhases.map((raw, phaseIndex): LevelPhaseConfig => {
    const phaseWhere = where + '.phases[' + String(phaseIndex) + ']';
    if (!isRecord(raw) || raw['id'] !== phaseIndex + 1) throw new Error(phaseWhere + ' has invalid id.');
    const view = raw['view'];
    if (view !== VIEWS[phaseIndex]) throw new Error(phaseWhere + '.view is invalid.');
    const pictureId = requiredText(raw, 'picture', phaseWhere);
    const picture = pictures.get(pictureId);
    if (picture === undefined) throw new Error(phaseWhere + '.picture references an unknown picture.');
    const setId = requiredText(raw, 'pieceSet', phaseWhere);
    const sourcePieces = sets.get(setId);
    if (sourcePieces === undefined) throw new Error(phaseWhere + '.pieceSet references an unknown set.');
    const prefix = 'l' + String(index + 1) + 'p' + String(phaseIndex + 1) + '-';
    const pieces = sourcePieces.map((piece) => ({ ...piece, id: prefix + piece.id }));
    checkInventory(picture.target, sourcePieces, phaseWhere);
    if (!canTileTarget(picture.target, sourcePieces)) throw new Error(phaseWhere + ' cannot be tiled by its pieces.');
    const placements = parseInitialPlacements(raw['initialPlacements'], sourcePieces, phaseWhere + '.initialPlacements').map((placement) => ({ ...placement, pieceId: prefix + placement.pieceId }));
    let grid;
    try { grid = createGridFromPlacements(pieces, placements); } catch { throw new Error(phaseWhere + '.initialPlacements must fit without overlaps.'); }
    if (gridMatchesTarget(grid, picture.target)) throw new Error(phaseWhere + ' must not start solved.');
    return { id: phaseIndex + 1, view: view as VoxelView, pictureId, ...picture, pieces, initialPlacements: placements };
  });
  return { id: index + 1, gridSize: GRID_SIZE, object: object ?? null, phases };
}
export function parseLevelPack(raw: unknown, expectedLevelCount: number): LevelConfig[] {
  if (!isRecord(raw) || raw['schemaVersion'] !== LEVELS_SCHEMA_VERSION) throw new Error('Level pack schemaVersion must be 6.');
  const sets = parsePieceSets(raw['pieceSets']);
  const pictures = parsePictures(raw['pictures']);
  const objects = parseObjects(raw['objects']);
  const levels = raw['levels'];
  if (!Array.isArray(levels) || levels.length !== expectedLevelCount) throw new Error('Level pack must contain exactly ' + String(expectedLevelCount) + ' levels.');
  return levels.map((level, index) => parseLevel(level, index, sets, pictures, objects));
}
