/**
 * Autosave of an in-progress level, per docs/rules.md §9 — the mechanic's own
 * counterpart to src/shell/progress/ProgressRepository.ts. Deliberately
 * separate: which levels are *completed* is shell-owned, generic progress;
 * where a piece currently sits mid-puzzle is game-specific data the shell has
 * no business understanding, so it lives here instead of widening
 * src/shell-contract.ts.
 */
export type SavedPlacements = Readonly<Record<string, { readonly row: number; readonly col: number }>>;

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveRepository {
  /** Returns null when there is no save, or it does not match this exact level id + version. */
  load(levelId: number, levelVersion: number): Promise<SavedPlacements | null>;
  save(levelId: number, levelVersion: number, placements: SavedPlacements): Promise<void>;
  clear(levelId: number): Promise<void>;
}

interface SaveBlob {
  readonly schemaVersion: number;
  readonly levelId: number;
  readonly levelVersion: number;
  readonly placements: SavedPlacements;
}

function isAnchor(value: unknown): value is { row: number; col: number } {
  if (typeof value !== 'object' || value === null) return false;
  const anchor = value as Record<string, unknown>;
  return typeof anchor['row'] === 'number' && typeof anchor['col'] === 'number';
}

/**
 * Narrows an untrusted blob read back from storage — the one place `unknown`
 * is correct, same rationale as ProgressRepository.parseProgress. A save that
 * targets a different level id/version (the picture or pieces changed) is
 * rejected rather than partially applied — docs/rules.md §9: "загрузка чужого
 * рисунка в другой уровень невозможна по построению ключа".
 */
export function parseSave(raw: unknown, levelId: number, levelVersion: number): SavedPlacements | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const blob = raw as Record<string, unknown>;

  if (blob['schemaVersion'] !== SAVE_SCHEMA_VERSION) return null;
  if (blob['levelId'] !== levelId || blob['levelVersion'] !== levelVersion) return null;

  const placements = blob['placements'];
  if (typeof placements !== 'object' || placements === null) return null;

  const result: Record<string, { row: number; col: number }> = {};
  for (const [pieceId, anchor] of Object.entries(placements)) {
    if (!isAnchor(anchor)) return null;
    result[pieceId] = { row: anchor.row, col: anchor.col };
  }
  return result;
}

export function serializeSave(levelId: number, levelVersion: number, placements: SavedPlacements): SaveBlob {
  return { schemaVersion: SAVE_SCHEMA_VERSION, levelId, levelVersion, placements };
}
