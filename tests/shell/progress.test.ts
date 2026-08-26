import { describe, expect, it } from 'vitest';
import { MemoryProgressRepository } from '../../src/shell/progress/MemoryProgressRepository.ts';
import {
  allLevelsCompleted,
  emptyProgress,
  isLevelCompleted,
  isLevelUnlocked,
  needsOnboarding,
  nextLevelIndex,
  parseProgress,
  PROGRESS_SCHEMA_VERSION,
  withLevelCompleted,
  withMoreAsked,
  withOnboardingSeen,
} from '../../src/shell/progress/ProgressRepository.ts';

describe('progress rules', () => {
  it('unlocks only the first level on a fresh install', () => {
    const state = emptyProgress();
    expect(isLevelUnlocked(state, 0)).toBe(true);
    expect(isLevelUnlocked(state, 1)).toBe(false);
  });

  it('unlocks the next level once the previous one is solved', () => {
    const state = withLevelCompleted(emptyProgress(), 0);
    expect(isLevelCompleted(state, 0)).toBe(true);
    expect(isLevelUnlocked(state, 1)).toBe(true);
    expect(isLevelUnlocked(state, 2)).toBe(false);
  });

  it('does not duplicate a level that is completed twice', () => {
    const once = withLevelCompleted(emptyProgress(), 3);
    const twice = withLevelCompleted(once, 3);
    expect(twice.completedLevels).toEqual([3]);
    expect(twice).toBe(once);
  });

  it('reports completion of the whole game', () => {
    let state = emptyProgress();
    for (let i = 0; i < 9; i += 1) state = withLevelCompleted(state, i);
    expect(allLevelsCompleted(state, 9)).toBe(true);
    expect(allLevelsCompleted(state, 10)).toBe(false);
  });

  it('stops offering a next level after the last one', () => {
    expect(nextLevelIndex(0, 9)).toBe(1);
    expect(nextLevelIndex(8, 9)).toBeNull();
  });

  it('shows onboarding again when its version moves ahead', () => {
    const seen = withOnboardingSeen(emptyProgress(), 1);
    expect(needsOnboarding(seen, 1)).toBe(false);
    expect(needsOnboarding(seen, 2)).toBe(true);
  });

  it('never walks the onboarding version backwards', () => {
    const seen = withOnboardingSeen(emptyProgress(), 5);
    expect(withOnboardingSeen(seen, 2).onboardingVersion).toBe(5);
  });

  it('records that the "more?" question was asked', () => {
    expect(withMoreAsked(emptyProgress()).moreAsked).toBe(true);
  });
});

describe('parseProgress', () => {
  it('accepts a blob it wrote itself', () => {
    const state = withLevelCompleted(withOnboardingSeen(emptyProgress(), 2), 1);
    expect(parseProgress(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('rejects a blob from a different schema version', () => {
    expect(parseProgress({ ...emptyProgress(), schemaVersion: 99 })).toBeNull();
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['missing fields', { schemaVersion: PROGRESS_SCHEMA_VERSION }],
    [
      'non-numeric levels',
      { schemaVersion: PROGRESS_SCHEMA_VERSION, onboardingVersion: 0, completedLevels: ['x'], moreAsked: false },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(parseProgress(raw)).toBeNull();
  });

  it('de-duplicates and sorts the level list it reads back', () => {
    const parsed = parseProgress({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      onboardingVersion: 1,
      completedLevels: [3, 1, 1, 0],
      moreAsked: false,
    });
    expect(parsed?.completedLevels).toEqual([0, 1, 3]);
  });
});

describe('MemoryProgressRepository', () => {
  it('round-trips state and clears it', async () => {
    const repo = new MemoryProgressRepository();
    expect(await repo.load()).toEqual(emptyProgress());

    const state = withLevelCompleted(emptyProgress(), 0);
    await repo.save(state);
    expect(await repo.load()).toEqual(state);

    await repo.clear();
    expect(await repo.load()).toEqual(emptyProgress());
  });
});
