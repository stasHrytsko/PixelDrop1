import type { Level, LevelState, MechanicEngine, TapInput } from './types.ts';

/**
 * Placeholder mechanic: clear every target on the board.
 *
 * It exists so the shell has something real to mount, complete and tear down
 * while the template itself is being tested. Delete it when a real game arrives
 * — but keep the shape: pure functions, no mutation, everything testable
 * without a browser.
 */
export const tapEngine: MechanicEngine<LevelState, TapInput, Level> = {
  create(level: Level): LevelState {
    return {
      remaining: level.targets.map((target) => target.id),
      taps: 0,
    };
  },

  apply(state: LevelState, input: TapInput): LevelState {
    if (!state.remaining.includes(input.targetId)) {
      // Tapping empty space still counts as a tap — the score has to be honest.
      return { ...state, taps: state.taps + 1 };
    }

    return {
      remaining: state.remaining.filter((id) => id !== input.targetId),
      taps: state.taps + 1,
    };
  },

  isComplete(state: LevelState): boolean {
    return state.remaining.length === 0;
  },
};
