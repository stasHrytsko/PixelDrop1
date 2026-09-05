import type { SaveRepository, SavedPlacements } from './SaveRepository.ts';

/** In-memory implementation for unit tests. */
export class MemorySaveRepository implements SaveRepository {
  readonly #saves = new Map<number, { levelVersion: number; placements: SavedPlacements }>();

  load(levelId: number, levelVersion: number): Promise<SavedPlacements | null> {
    const entry = this.#saves.get(levelId);
    if (entry === undefined || entry.levelVersion !== levelVersion) return Promise.resolve(null);
    return Promise.resolve(entry.placements);
  }

  save(levelId: number, levelVersion: number, placements: SavedPlacements): Promise<void> {
    this.#saves.set(levelId, { levelVersion, placements });
    return Promise.resolve();
  }

  clear(levelId: number): Promise<void> {
    this.#saves.delete(levelId);
    return Promise.resolve();
  }
}
