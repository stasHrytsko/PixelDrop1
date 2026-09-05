import { Preferences } from '@capacitor/preferences';
import { parseSave, serializeSave, type SaveRepository, type SavedPlacements } from './SaveRepository.ts';

/**
 * Backed by @capacitor/preferences, same reasoning as
 * PreferencesProgressRepository: Android may clear a WebView's localStorage,
 * Preferences does not.
 */
export class PreferencesSaveRepository implements SaveRepository {
  readonly #gameId: string;

  constructor(gameId: string) {
    this.#gameId = gameId;
  }

  #key(levelId: number): string {
    return `pixelDropSave:${this.#gameId}:${String(levelId)}`;
  }

  async load(levelId: number, levelVersion: number): Promise<SavedPlacements | null> {
    const { value } = await Preferences.get({ key: this.#key(levelId) });
    if (value === null) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
    return parseSave(raw, levelId, levelVersion);
  }

  async save(levelId: number, levelVersion: number, placements: SavedPlacements): Promise<void> {
    await Preferences.set({
      key: this.#key(levelId),
      value: JSON.stringify(serializeSave(levelId, levelVersion, placements)),
    });
  }

  async clear(levelId: number): Promise<void> {
    await Preferences.remove({ key: this.#key(levelId) });
  }
}
