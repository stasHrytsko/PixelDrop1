import { Preferences } from '@capacitor/preferences';
import {
  emptyProgress,
  parseProgress,
  type ProgressRepository,
  type ProgressState,
} from './ProgressRepository.ts';

/**
 * Progress storage backed by @capacitor/preferences.
 *
 * Not window.localStorage: Android may clear a WebView's localStorage at any
 * point, which would silently wipe a player's progress. Preferences maps onto
 * SharedPreferences on Android and UserDefaults on iOS, and falls back to
 * localStorage only in the browser, where nothing better exists anyway.
 */
export class PreferencesProgressRepository implements ProgressRepository {
  readonly #key: string;

  constructor(gameId: string) {
    this.#key = `progress:${gameId}`;
  }

  async load(): Promise<ProgressState> {
    const { value } = await Preferences.get({ key: this.#key });
    if (value === null) return emptyProgress();

    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      return emptyProgress();
    }

    // A blob we cannot read is treated as no progress rather than as a crash:
    // losing progress is bad, but a game that refuses to start is worse.
    return parseProgress(raw) ?? emptyProgress();
  }

  async save(state: ProgressState): Promise<void> {
    await Preferences.set({ key: this.#key, value: JSON.stringify(state) });
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: this.#key });
  }
}
