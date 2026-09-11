/**
 * Persisted player progress.
 *
 * Deliberately tiny and JSON-serialisable: it crosses a storage boundary, so
 * every field here must survive being written by an older build and read by a
 * newer one.
 */
export interface ProgressState {
  /** Shape version of this blob. Mismatched blobs are discarded, not migrated. */
  readonly schemaVersion: number;
  /** Highest onboarding version the player has already seen. 0 = never. */
  readonly onboardingVersion: number;
  /** 0-based indices of solved levels. Unordered, unique. */
  readonly completedLevels: readonly number[];
  /** The "Ещё?" popup has already been shown — never ask twice. */
  readonly moreAsked: boolean;
  /** One resumable mechanic session; its snapshot remains opaque to the shell. */
  readonly activeLevel: { readonly levelIndex: number; readonly snapshot: unknown } | null;
}

export const PROGRESS_SCHEMA_VERSION = 2;

export interface ProgressRepository {
  load(): Promise<ProgressState>;
  save(state: ProgressState): Promise<void>;
  clear(): Promise<void>;
}

export function emptyProgress(): ProgressState {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    onboardingVersion: 0,
    completedLevels: [],
    moreAsked: false,
    activeLevel: null,
  };
}

/**
 * Narrow an untrusted blob read back from storage. This is the one place where
 * `unknown` is correct: anything could be in storage, including a blob written
 * by a previous version of the app.
 */
export function parseProgress(raw: unknown): ProgressState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (candidate['schemaVersion'] !== PROGRESS_SCHEMA_VERSION) return null;
  if (typeof candidate['onboardingVersion'] !== 'number') return null;
  if (typeof candidate['moreAsked'] !== 'boolean') return null;
  const active = candidate['activeLevel'];
  if (active !== null && (
    typeof active !== 'object' ||
    !Number.isInteger((active as Record<string, unknown>)['levelIndex']) ||
    (active as Record<string, unknown>)['levelIndex'] as number < 0 ||
    !Object.prototype.hasOwnProperty.call(active, 'snapshot')
  )) return null;

  const levels = candidate['completedLevels'];
  if (!Array.isArray(levels)) return null;
  if (!levels.every((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
    return null;
  }

  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    onboardingVersion: candidate['onboardingVersion'],
    completedLevels: [...new Set(levels)].sort((a, b) => a - b),
    moreAsked: candidate['moreAsked'],
    activeLevel: active === null ? null : {
      levelIndex: (active as Record<string, unknown>)['levelIndex'] as number,
      snapshot: (active as Record<string, unknown>)['snapshot'],
    },
  };
}

// --- Pure progress rules. No storage, no DOM — trivially testable. ---

export function isLevelCompleted(state: ProgressState, levelIndex: number): boolean {
  return state.completedLevels.includes(levelIndex);
}

/** Levels unlock strictly in order: level N needs level N-1 solved. */
export function isLevelUnlocked(state: ProgressState, levelIndex: number): boolean {
  if (levelIndex === 0) return true;
  return isLevelCompleted(state, levelIndex - 1);
}

export function withLevelCompleted(state: ProgressState, levelIndex: number): ProgressState {
  if (isLevelCompleted(state, levelIndex)) return state;
  return {
    ...state,
    completedLevels: [...state.completedLevels, levelIndex].sort((a, b) => a - b),
  };
}

export function withOnboardingSeen(state: ProgressState, onboardingVersion: number): ProgressState {
  if (state.onboardingVersion >= onboardingVersion) return state;
  return { ...state, onboardingVersion };
}

export function withMoreAsked(state: ProgressState): ProgressState {
  if (state.moreAsked) return state;
  return { ...state, moreAsked: true };
}

export function withActiveLevel(state: ProgressState, levelIndex: number, snapshot: unknown): ProgressState {
  return { ...state, activeLevel: { levelIndex, snapshot } };
}

export function withoutActiveLevel(state: ProgressState, levelIndex?: number): ProgressState {
  if (state.activeLevel === null || (levelIndex !== undefined && state.activeLevel.levelIndex !== levelIndex)) return state;
  return { ...state, activeLevel: null };
}

export function allLevelsCompleted(state: ProgressState, levelCount: number): boolean {
  for (let i = 0; i < levelCount; i += 1) {
    if (!isLevelCompleted(state, i)) return false;
  }
  return true;
}

/** The next level to offer after finishing `levelIndex`, or null if that was the last. */
export function nextLevelIndex(levelIndex: number, levelCount: number): number | null {
  const next = levelIndex + 1;
  return next < levelCount ? next : null;
}

export function needsOnboarding(state: ProgressState, currentOnboardingVersion: number): boolean {
  return state.onboardingVersion < currentOnboardingVersion;
}
